import { useEffect, useRef, useCallback } from 'react'
import cytoscape, { Core, NodeSingular } from 'cytoscape'
import { useGraphStore } from '@/stores'
import type { ConceptNode, ConceptEdge } from '@/types'

// Mastery state → color
const MASTERY_COLORS: Record<string, string> = {
  untouched: '#1e3a5f',
  in_progress: '#78350f',
  mastered: '#134e4a',
  review: '#881337',
}
const MASTERY_BORDER: Record<string, string> = {
  untouched: '#284f80',
  in_progress: '#d97706',
  mastered: '#0d9488',
  review: '#be185d',
}
const MASTERY_TEXT: Record<string, string> = {
  untouched: '#94a3b8',
  in_progress: '#fcd34d',
  mastered: '#5eead4',
  review: '#fda4af',
}

function buildCyElements(nodes: ConceptNode[], edges: ConceptEdge[]) {
  const cyNodes = nodes.map((n) => ({
    data: {
      id: n.id,
      label: n.name,
      difficulty: n.difficulty,
      domain: n.domain,
      mastery_state: n.mastery_state,
      mastery_confidence: n.mastery_confidence,
      description: n.description,
    },
  }))

  const cyEdges = edges
    .filter((e) => e.source && e.target && e.source !== e.target)
    .map((e, i) => ({
      data: {
        id: `e-${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        relationship: e.relationship,
        strength: e.strength,
      },
    }))

  return [...cyNodes, ...cyEdges]
}

const CY_STYLESHEET: cytoscape.Stylesheet[] = [
  {
    selector: 'node',
    style: {
      'background-color': (el: NodeSingular) =>
        MASTERY_COLORS[el.data('mastery_state')] || '#1e3a5f',
      'border-color': (el: NodeSingular) =>
        MASTERY_BORDER[el.data('mastery_state')] || '#284f80',
      'border-width': 1.5,
      color: (el: NodeSingular) =>
        MASTERY_TEXT[el.data('mastery_state')] || '#94a3b8',
      'font-family': '"DM Sans", sans-serif',
      'font-size': '11px',
      'font-weight': '500',
      label: 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'ellipsis',
      'text-max-width': '90px',
      width: (el: NodeSingular) => 20 + el.data('difficulty') * 8,
      height: (el: NodeSingular) => 20 + el.data('difficulty') * 8,
      'padding': '6px',
      shape: 'round-rectangle',
    } as any,
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#2dd4bf',
      'border-width': 2.5,
      'background-color': '#0f4f4a',
    },
  },
  {
    selector: 'node.highlighted',
    style: {
      'border-color': '#2dd4bf',
      'border-width': 3,
      'background-color': '#0d3d38',
      color: '#2dd4bf',
      'overlay-color': '#2dd4bf',
      'overlay-opacity': 0.08,
    } as any,
  },
  {
    selector: 'node.dimmed',
    style: { opacity: 0.25 },
  },
  {
    selector: 'edge',
    style: {
      width: (el: any) => Math.max(0.5, (el.data('strength') || 0.5) * 2),
      'line-color': '#1e3a5f',
      'target-arrow-color': '#1e3a5f',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.7,
      'curve-style': 'bezier',
      opacity: 0.6,
    } as any,
  },
  {
    selector: 'edge[relationship = "PREREQUISITE_OF"]',
    style: {
      'line-color': '#284f80',
      'target-arrow-color': '#284f80',
      'line-style': 'solid',
    },
  },
  {
    selector: 'edge[relationship = "RELATED_TO"]',
    style: {
      'line-color': '#1e3a5f',
      'line-style': 'dashed',
      'line-dash-pattern': [6, 4],
      'target-arrow-shape': 'none',
    } as any,
  },
  {
    selector: 'edge.highlighted',
    style: {
      'line-color': 'rgba(45,212,191,0.5)',
      'target-arrow-color': 'rgba(45,212,191,0.5)',
      opacity: 1,
    },
  },
]

interface GraphCanvasProps {
  className?: string
}

export default function GraphCanvas({ className = '' }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const { nodes, edges, highlightedNodeIds, activeNodeId, setActiveNode, setCenterNode } = useGraphStore()

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      elements: buildCyElements(nodes, edges),
      style: CY_STYLESHEET,
      layout: { name: 'cose', animate: true, animationDuration: 600, nodeRepulsion: () => 6000 } as any,
      minZoom: 0.3,
      maxZoom: 3,
      wheelSensitivity: 0.2,
    })

    // Node click
    cy.on('tap', 'node', (evt) => {
      const node = evt.target
      setActiveNode(node.id())
      setCenterNode(node.id())
    })

    // Background click deselects
    cy.on('tap', (evt) => {
      if (evt.target === cy) setActiveNode(null)
    })

    cyRef.current = cy
    return () => { cy.destroy(); cyRef.current = null }
  }, []) // Only run once

  // Sync nodes/edges when data changes
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    const elements = buildCyElements(nodes, edges)
    cy.elements().remove()
    cy.add(elements)
    cy.layout({ name: 'cose', animate: true, animationDuration: 500, nodeRepulsion: () => 6000 } as any).run()
  }, [nodes, edges])

  // Apply highlight classes
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.elements().removeClass('highlighted dimmed')

    if (highlightedNodeIds.length > 0) {
      const highlighted = cy.nodes().filter((n) => highlightedNodeIds.includes(n.id()))
      highlighted.addClass('highlighted')
      const connectedEdges = highlighted.connectedEdges()
      connectedEdges.addClass('highlighted')

      // Dim unrelated nodes
      cy.nodes().filter((n) => !highlightedNodeIds.includes(n.id())).addClass('dimmed')
    }
  }, [highlightedNodeIds])

  // Center on active node
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !activeNodeId) return
    const node = cy.getElementById(activeNodeId)
    if (node.length) {
      cy.animate({ center: { eles: node }, zoom: 1.5 }, { duration: 400 })
    }
  }, [activeNodeId])

  return (
    <div
      ref={containerRef}
      className={`cy-container ${className}`}
      style={{ background: 'var(--navy-950)' }}
    />
  )
}
