from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.graph_store import get_graph_store
from app.models.database import User
from app.models.schemas import (
    ConceptCreate, GraphResponse, ConceptNode, ConceptEdge,
    LearningPathResponse, MasteryUpdate,
)
from app.api.routes.auth import get_current_user
import uuid

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/neighborhood/{concept_id}", response_model=GraphResponse)
async def get_neighborhood(
    concept_id: str,
    hops: int = Query(default=2, ge=1, le=3),
    user: User = Depends(get_current_user),
):
    graph = get_graph_store()
    data = await graph.get_concept_neighborhood(
        concept_id, hops=hops, user_id=str(user.id)
    )
    nodes = [ConceptNode(**n) for n in data["nodes"]]
    edges = [ConceptEdge(**e) for e in data["edges"]]
    return GraphResponse(nodes=nodes, edges=edges, center_node_id=concept_id)


@router.get("/concepts")
async def list_concepts(
    domain: str | None = None,
    user: User = Depends(get_current_user),
):
    graph = get_graph_store()
    concepts = await graph.get_all_concepts(domain=domain)
    mastery = await graph.get_user_mastery(str(user.id))
    mastery_map = {m["concept_id"]: m for m in mastery}

    result = []
    for c in concepts:
        cid = c.get("id")
        m = mastery_map.get(cid, {})
        result.append({
            **c,
            "mastery_confidence": m.get("confidence", 0.0),
            "mastery_state": m.get("state", "untouched"),
        })
    return result


@router.get("/search")
async def search_concepts(
    q: str,
    user: User = Depends(get_current_user),
):
    graph = get_graph_store()
    results = await graph.fulltext_search(q, limit=10)
    return results


@router.post("/concepts", status_code=201)
async def create_concept(
    body: ConceptCreate,
    user: User = Depends(get_current_user),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    graph = get_graph_store()
    cid = str(uuid.uuid4())
    concept = await graph.create_concept(
        id=cid,
        name=body.name,
        description=body.description,
        difficulty=body.difficulty,
        domain=body.domain,
    )
    for prereq_id in body.prerequisite_ids:
        await graph.create_prerequisite(prereq_id, cid)
    return concept


@router.get("/path")
async def learning_path(
    from_id: str,
    to_id: str,
    user: User = Depends(get_current_user),
):
    graph = get_graph_store()
    path = await graph.get_learning_path(from_id, to_id)
    return LearningPathResponse(
        path=[ConceptNode(**n) for n in path],
        total_concepts=len(path),
        estimated_hours=len(path) * 1.5,
        mastered_count=0,
    )


@router.get("/frontier")
async def frontier_concepts(user: User = Depends(get_current_user)):
    graph = get_graph_store()
    frontier = await graph.get_frontier_concepts(str(user.id), limit=8)
    return frontier


@router.post("/mastery")
async def update_mastery(
    body: MasteryUpdate,
    user: User = Depends(get_current_user),
):
    graph = get_graph_store()
    await graph.update_mastery(
        user_id=str(user.id),
        concept_id=body.concept_id,
        state=body.state,
        confidence=body.confidence,
    )
    return {"ok": True}


@router.get("/mastery")
async def get_mastery(user: User = Depends(get_current_user)):
    graph = get_graph_store()
    return await graph.get_user_mastery(str(user.id))
