import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Check, X, Trash2, Loader2, GripVertical } from 'lucide-react';

interface DragHandleProps {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

interface InlineEditableItemProps {
  id: string;
  name: string;
  editingId: string | null;
  editingName: string;
  deletingId: string | null;
  onStartEdit: (id: string, name: string) => void;
  onCancelEdit: () => void;
  onConfirmEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onEditingNameChange: (name: string) => void;
  /** Rendered before the name text (e.g., a color dot). */
  prefix?: React.ReactNode;
  /** Rendered between name and edit/delete buttons (e.g., a team selector). */
  extra?: React.ReactNode;
  /** Props for the drag handle. When provided, a grip icon appears as a drag handle. */
  dragHandleProps?: DragHandleProps;
  /** Called when an item is dragged over this item. */
  onDragOver?: (e: React.DragEvent) => void;
  /** Called when an item is dropped on this item. */
  onDrop?: (e: React.DragEvent) => void;
  /** Whether this item is currently being dragged over. */
  isDragOver?: boolean;
}

export default function InlineEditableItem({
  id,
  name,
  editingId,
  editingName,
  deletingId,
  onStartEdit,
  onCancelEdit,
  onConfirmEdit,
  onDelete,
  onEditingNameChange,
  prefix,
  extra,
  dragHandleProps,
  onDragOver,
  onDrop,
  isDragOver,
}: InlineEditableItemProps) {
  const isEditing = editingId === id;
  const isDeleting = deletingId === id;

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg border bg-card transition-colors ${isDragOver ? 'border-primary bg-primary/5' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-3 min-w-0">
        {dragHandleProps && (
          <div
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        {prefix}
        {isEditing ? (
          <Input
            className="h-7 text-sm"
            value={editingName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirmEdit(id);
              if (e.key === 'Escape') onCancelEdit();
            }}
            autoFocus
          />
        ) : (
          <p className="font-medium truncate">{name}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {extra}
        {isEditing ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => onConfirmEdit(id)}>
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancelEdit}>
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => onStartEdit(id, name)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(id)} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
