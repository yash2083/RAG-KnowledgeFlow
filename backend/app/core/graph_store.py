import asyncio
from typing import Any
from neo4j import AsyncGraphDatabase, AsyncDriver
import structlog

from app.config import settings

log = structlog.get_logger()


CONSTRAINTS_QUERIES = [
    "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Concept) REQUIRE c.id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (cc:ContentChunk) REQUIRE cc.id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (lp:LearnerProfile) REQUIRE lp.user_id IS UNIQUE",
]

INDEXES_QUERIES = [
    "CREATE INDEX IF NOT EXISTS FOR (c:Concept) ON (c.domain)",
    "CREATE INDEX IF NOT EXISTS FOR (c:Concept) ON (c.difficulty)",
    "CREATE FULLTEXT INDEX IF NOT EXISTS FOR (c:Concept) ON EACH [c.name, c.description]",
]


class GraphStore:
    """Neo4j knowledge graph with prerequisite traversal."""

    def __init__(self):
        self.driver: AsyncDriver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )

    async def setup(self):
        async with self.driver.session() as session:
            for q in CONSTRAINTS_QUERIES + INDEXES_QUERIES:
                try:
                    await session.run(q)
                except Exception as e:
                    log.warning("graph.setup_warning", query=q, error=str(e))
        log.info("graph.setup_complete")

    async def close(self):
        await self.driver.close()

    # ─── Concept CRUD ──────────────────────────────────────────────────────

    async def create_concept(
        self,
        id: str,
        name: str,
        description: str,
        difficulty: int,
        domain: str,
        embedding_id: str | None = None,
    ) -> dict:
        async with self.driver.session() as session:
            result = await session.run(
                """
                MERGE (c:Concept {id: $id})
                ON CREATE SET
                    c.name = $name,
                    c.description = $description,
                    c.difficulty = $difficulty,
                    c.domain = $domain,
                    c.embedding_id = $embedding_id,
                    c.created_at = datetime()
                ON MATCH SET
                    c.name = $name,
                    c.description = $description,
                    c.difficulty = $difficulty,
                    c.updated_at = datetime()
                RETURN c
                """,
                id=id, name=name, description=description,
                difficulty=difficulty, domain=domain, embedding_id=embedding_id,
            )
            record = await result.single()
            return dict(record["c"])

    async def create_prerequisite(
        self, from_id: str, to_id: str, strength: float = 0.8
    ):
        """Create PREREQUISITE_OF edge: from_id must be learned before to_id."""
        async with self.driver.session() as session:
            await session.run(
                """
                MATCH (a:Concept {id: $from_id}), (b:Concept {id: $to_id})
                MERGE (a)-[r:PREREQUISITE_OF]->(b)
                SET r.strength = $strength, r.created_at = datetime()
                """,
                from_id=from_id, to_id=to_id, strength=strength,
            )

    async def create_related(self, id_a: str, id_b: str, strength: float = 0.5):
        async with self.driver.session() as session:
            await session.run(
                """
                MATCH (a:Concept {id: $id_a}), (b:Concept {id: $id_b})
                MERGE (a)-[r:RELATED_TO]-(b)
                SET r.strength = $strength
                """,
                id_a=id_a, id_b=id_b, strength=strength,
            )

    async def link_chunk_to_concept(
        self, chunk_id: str, concept_id: str, relevance: float
    ):
        async with self.driver.session() as session:
            await session.run(
                """
                MERGE (cc:ContentChunk {id: $chunk_id})
                WITH cc
                MATCH (c:Concept {id: $concept_id})
                MERGE (cc)-[r:COVERS]->(c)
                SET r.relevance = $relevance
                """,
                chunk_id=chunk_id, concept_id=concept_id, relevance=relevance,
            )

    # ─── Retrieval ─────────────────────────────────────────────────────────

    async def get_concept_neighborhood(
        self, concept_id: str, hops: int = 2, user_id: str | None = None
    ) -> dict:
        """Return nodes + edges within N hops of a concept."""
        async with self.driver.session() as session:
            result = await session.run(
                """
                MATCH path = (c:Concept {id: $concept_id})-[*0..$hops]-(neighbor:Concept)
                WITH collect(DISTINCT neighbor) + [c] AS nodes,
                     collect(DISTINCT relationships(path)) AS rel_lists
                UNWIND nodes AS n
                OPTIONAL MATCH (n)-[r:PREREQUISITE_OF|RELATED_TO]-(m:Concept)
                WHERE m IN nodes
                WITH collect(DISTINCT n) AS ns,
                     collect(DISTINCT {
                       source: startNode(r).id,
                       target: endNode(r).id,
                       type: type(r),
                       strength: r.strength
                     }) AS edges
                RETURN ns, edges
                """,
                concept_id=concept_id, hops=hops,
            )
            record = await result.single()
            if not record:
                return {"nodes": [], "edges": []}

            nodes = [dict(n) for n in record["ns"]]
            edges = [dict(e) for e in record["edges"] if e["source"] and e["target"]]

            # Attach mastery data if user provided
            if user_id and nodes:
                mastery = await self.get_user_mastery(user_id)
                mastery_map = {m["concept_id"]: m for m in mastery}
                for node in nodes:
                    nid = node["id"]
                    if nid in mastery_map:
                        node["mastery_confidence"] = mastery_map[nid]["confidence"]
                        node["mastery_state"] = mastery_map[nid]["state"]
                    else:
                        node["mastery_confidence"] = 0.0
                        node["mastery_state"] = "untouched"

            return {"nodes": nodes, "edges": edges}

    async def get_related_concept_ids(
        self, concept_ids: list[str], limit: int = 5
    ) -> list[str]:
        """Graph-based retrieval: get related concepts by traversal."""
        if not concept_ids:
            return []
        async with self.driver.session() as session:
            result = await session.run(
                """
                UNWIND $concept_ids AS cid
                MATCH (c:Concept {id: cid})-[:PREREQUISITE_OF|RELATED_TO*1..2]-(n:Concept)
                WHERE NOT n.id IN $concept_ids
                RETURN DISTINCT n.id AS id, count(*) AS relevance
                ORDER BY relevance DESC
                LIMIT $limit
                """,
                concept_ids=concept_ids, limit=limit,
            )
            return [r["id"] async for r in result]

    async def get_chunks_for_concepts(
        self, concept_ids: list[str], limit: int = 5
    ) -> list[str]:
        """Return chunk IDs that cover given concepts (high relevance first)."""
        async with self.driver.session() as session:
            result = await session.run(
                """
                UNWIND $concept_ids AS cid
                MATCH (cc:ContentChunk)-[r:COVERS]->(c:Concept {id: cid})
                RETURN DISTINCT cc.id AS chunk_id, r.relevance AS relevance
                ORDER BY r.relevance DESC
                LIMIT $limit
                """,
                concept_ids=concept_ids, limit=limit,
            )
            return [r["chunk_id"] async for r in result]

    async def get_learning_path(
        self, from_concept_id: str, to_concept_id: str
    ) -> list[dict]:
        """Shortest prerequisite path between two concepts."""
        async with self.driver.session() as session:
            result = await session.run(
                """
                MATCH path = shortestPath(
                  (a:Concept {id: $from_id})-[:PREREQUISITE_OF*]->(b:Concept {id: $to_id})
                )
                RETURN [node IN nodes(path) | {id: node.id, name: node.name,
                    difficulty: node.difficulty, domain: node.domain}] AS path
                """,
                from_id=from_concept_id, to_id=to_concept_id,
            )
            record = await result.single()
            return record["path"] if record else []

    async def get_frontier_concepts(self, user_id: str, limit: int = 5) -> list[dict]:
        """Return concepts the learner is ready to study (prerequisites mastered)."""
        async with self.driver.session() as session:
            result = await session.run(
                """
                MATCH (lp:LearnerProfile {user_id: $user_id})-[m:HAS_MASTERED]->(mastered:Concept)
                WHERE m.confidence >= 0.7
                MATCH (mastered)-[:PREREQUISITE_OF]->(next:Concept)
                WHERE NOT EXISTS {
                    MATCH (lp)-[nm:HAS_MASTERED]->(next)
                    WHERE nm.confidence >= 0.7
                }
                RETURN DISTINCT next.id AS id, next.name AS name,
                    next.difficulty AS difficulty, next.domain AS domain,
                    next.description AS description,
                    count(mastered) AS readiness
                ORDER BY readiness DESC, next.difficulty ASC
                LIMIT $limit
                """,
                user_id=user_id, limit=limit,
            )
            return [dict(r) async for r in result]

    async def fulltext_search(self, query: str, limit: int = 10) -> list[dict]:
        """Search concepts by name/description."""
        async with self.driver.session() as session:
            result = await session.run(
                """
                CALL db.index.fulltext.queryNodes('concept_name_description', $query)
                YIELD node, score
                RETURN node.id AS id, node.name AS name, node.domain AS domain,
                    node.difficulty AS difficulty, node.description AS description, score
                ORDER BY score DESC
                LIMIT $limit
                """,
                query=query, limit=limit,
            )
            return [dict(r) async for r in result]

    # ─── Learner Profile ───────────────────────────────────────────────────

    async def upsert_learner(self, user_id: str):
        async with self.driver.session() as session:
            await session.run(
                "MERGE (lp:LearnerProfile {user_id: $user_id}) "
                "ON CREATE SET lp.created_at = datetime()",
                user_id=user_id,
            )

    async def update_mastery(
        self, user_id: str, concept_id: str, state: str, confidence: float
    ):
        async with self.driver.session() as session:
            await session.run(
                """
                MATCH (lp:LearnerProfile {user_id: $user_id}), (c:Concept {id: $concept_id})
                MERGE (lp)-[m:HAS_MASTERED]->(c)
                SET m.state = $state, m.confidence = $confidence,
                    m.last_assessed_at = datetime()
                """,
                user_id=user_id, concept_id=concept_id,
                state=state, confidence=confidence,
            )

    async def get_user_mastery(self, user_id: str) -> list[dict]:
        async with self.driver.session() as session:
            result = await session.run(
                """
                MATCH (lp:LearnerProfile {user_id: $user_id})-[m:HAS_MASTERED]->(c:Concept)
                RETURN c.id AS concept_id, m.state AS state, m.confidence AS confidence,
                    m.last_assessed_at AS last_assessed_at
                """,
                user_id=user_id,
            )
            return [dict(r) async for r in result]

    async def get_all_concepts(self, domain: str | None = None) -> list[dict]:
        async with self.driver.session() as session:
            query = "MATCH (c:Concept)"
            if domain:
                query += " WHERE c.domain = $domain"
            query += " RETURN c ORDER BY c.difficulty"
            result = await session.run(query, domain=domain)
            return [dict(r["c"]) async for r in result]


# Singleton
_graph_store: GraphStore | None = None


def get_graph_store() -> GraphStore:
    global _graph_store
    if _graph_store is None:
        _graph_store = GraphStore()
    return _graph_store
