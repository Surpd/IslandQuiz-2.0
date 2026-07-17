import type { ComponentType } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableQuestion {
  id: string;
  type: string;
  q: string;
}

interface TypeMeta {
  label: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
}

interface SortableQuestionListProps {
  questions: SortableQuestion[];
  typeMeta: Record<string, TypeMeta>;
  onReorder: (newOrder: number[]) => void;
  onSelect?: (index: number) => void;
}

export function SortableQuestionList({
  questions,
  typeMeta,
  onReorder,
  onSelect,
}: SortableQuestionListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const indices = questions.map((_, i) => i);
    onReorder(arrayMove(indices, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-1">
          {questions.map((q, index) => (
            <SortableItem
              key={q.id}
              question={q}
              index={index}
              meta={typeMeta[q.type]}
              onSelect={onSelect}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  question,
  index,
  meta,
  onSelect,
}: {
  question: SortableQuestion;
  index: number;
  meta?: TypeMeta;
  onSelect?: (index: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = meta?.icon;
  const preview = question.q.trim().slice(0, 30) || "Без названия";
  const truncated = question.q.trim().length > 30;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-2 py-1.5 text-xs transition-colors",
        isDragging && "z-10 opacity-60 shadow-lift",
        !isDragging && "hover:border-primary/40 hover:bg-surface",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Перетащить"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onSelect?.(index)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-muted-foreground">
          {index + 1}.
        </span>
        {Icon && (
          <span className={cn("shrink-0", meta?.tone)} title={meta?.label}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">
          {preview}
          {truncated ? "…" : ""}
        </span>
      </button>
    </li>
  );
}
