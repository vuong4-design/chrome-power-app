import type {CSSProperties, ReactNode} from 'react';
import {useEffect, useMemo, useRef, useState} from 'react';

export type Position = {x: number; y: number};

export type Node<Data = unknown> = {
  id: string;
  position: Position;
  data: Data;
  type?: string;
};

export type Edge<Data = unknown> = {
  id: string;
  source: string;
  target: string;
  data?: Data;
};

export type NodeChange =
  | {id: string; type: 'position'; position: Position}
  | {id: string; type: 'remove'};

export type EdgeChange =
  | {id: string; type: 'remove'};

export type Connection = {
  source: string;
  target: string;
};

export type NodeProps<Data = any> = {
  id: string;
  data: Data;
  selected: boolean;
};

type NodeTypeMap = Record<string, (props: NodeProps<any>) => JSX.Element>;

export const applyNodeChanges = <T,>(changes: NodeChange[], nodes: Array<Node<T>>) => {
  let next = [...nodes];
  for (const change of changes) {
    if (change.type === 'remove') {
      next = next.filter(node => node.id !== change.id);
    }
    if (change.type === 'position') {
      next = next.map(node => (node.id === change.id ? {...node, position: change.position} : node));
    }
  }
  return next;
};

export const applyEdgeChanges = <T,>(changes: EdgeChange[], edges: Array<Edge<T>>) => {
  let next = [...edges];
  for (const change of changes) {
    if (change.type === 'remove') {
      next = next.filter(edge => edge.id !== change.id);
    }
  }
  return next;
};

export const addEdge = <T,>(connection: Connection, edges: Array<Edge<T>>) => {
  const id = `${connection.source}-${connection.target}`;
  if (edges.some(edge => edge.id === id)) {
    return edges;
  }
  return [...edges, {id, source: connection.source, target: connection.target}];
};

type ReactFlowProps = {
  nodes: Node[];
  edges: Edge[];
  onNodesChange?: (changes: NodeChange[]) => void;
  onEdgesChange?: (changes: EdgeChange[]) => void;
  onConnect?: (connection: Connection) => void;
  onNodeClick?: (node: Node) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  nodeTypes?: NodeTypeMap;
  children?: ReactNode;
  style?: CSSProperties;
};

const defaultStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 520,
  background: '#f6f7f9',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  overflow: 'hidden',
};

export const ReactFlow = ({
  nodes,
  edges,
  onNodesChange,
  onNodeClick,
  onDrop,
  onDragOver,
  nodeTypes,
  children,
  style,
}: ReactFlowProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<null | {id: string; offset: Position}>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!dragging) {
      return;
    }
    const handleMove = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const position = {
        x: event.clientX - rect.left - dragging.offset.x,
        y: event.clientY - rect.top - dragging.offset.y,
      };
      onNodesChange?.([{id: dragging.id, type: 'position', position}]);
    };
    const handleUp = () => {
      setDragging(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, onNodesChange]);

  const nodeMap = useMemo(() => {
    return Object.fromEntries(nodes.map(node => [node.id, node]));
  }, [nodes]);

  const handleNodeMouseDown = (event: React.MouseEvent, node: Node) => {
    event.stopPropagation();
    if (!containerRef.current) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    setDragging({
      id: node.id,
      offset: {
        x: event.clientX - rect.left - node.position.x,
        y: event.clientY - rect.top - node.position.y,
      },
    });
  };

  const handleNodeClick = (node: Node) => {
    setSelectedId(node.id);
    onNodeClick?.(node);
  };

  return (
    <div
      ref={containerRef}
      style={{...defaultStyle, ...style}}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onClick={() => setSelectedId(null)}
    >
      <svg
        width="100%"
        height="100%"
        style={{position: 'absolute', inset: 0}}
      >
        {edges.map(edge => {
          const source = nodeMap[edge.source];
          const target = nodeMap[edge.target];
          if (!source || !target) {
            return null;
          }
          const x1 = source.position.x + 90;
          const y1 = source.position.y + 30;
          const x2 = target.position.x + 90;
          const y2 = target.position.y + 30;
          return (
            <line
              key={edge.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#94a3b8"
              strokeWidth={2}
            />
          );
        })}
      </svg>
      {nodes.map(node => {
        const NodeComponent = nodeTypes?.[node.type ?? ''] ?? DefaultNode;
        return (
          <div
            key={node.id}
            style={{
              position: 'absolute',
              transform: `translate(${node.position.x}px, ${node.position.y}px)`,
              cursor: 'move',
            }}
            onMouseDown={event => handleNodeMouseDown(event, node)}
            onClick={() => handleNodeClick(node)}
          >
            <NodeComponent
              id={node.id}
              data={node.data}
              selected={node.id === selectedId}
            />
          </div>
        );
      })}
      {children}
    </div>
  );
};

const DefaultNode = ({data, selected}: NodeProps<any>) => (
  <div
    style={{
      width: 180,
      padding: '8px 12px',
      borderRadius: 8,
      border: `2px solid ${selected ? '#2563eb' : '#cbd5f5'}`,
      background: '#fff',
      boxShadow: '0 6px 20px rgba(15, 23, 42, 0.12)',
      fontSize: 13,
      fontWeight: 600,
    }}
  >
    {data?.label ?? 'Node'}
  </div>
);

export const ReactFlowProvider = ({children}: {children: ReactNode}) => <>{children}</>;

export const Background = () => null;
export const Controls = () => null;

export default ReactFlow;
