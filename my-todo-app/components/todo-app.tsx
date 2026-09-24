"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ArrowUp,
  CircleCheckBig,
  CircleDashed,
  GripVertical,
  Loader2,
  MessageCircle,
  Plus,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Comment = {
  id: string;
  authorName: string;
  text: string;
};

type Todo = {
  id: string;
  text: string;
  completed: boolean;
  comments: Comment[];
};

type TodoActions = {
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onAddComment: (id: string, text: string) => void;
};

type ColumnId = "todo" | "done";

// 削除してから実際にデータベースから消すまでの猶予（この間は取り消せる）
const UNDO_DELETE_MS = 5000;

// 取り消し待ちの削除。元の位置に戻せるように並び順も覚えておく
type PendingDelete = {
  todo: Todo;
  index: number;
  timer: ReturnType<typeof setTimeout>;
};

const COLUMNS: {
  id: ColumnId;
  title: string;
  empty: string;
  icon: LucideIcon;
  iconClass: string;
  badgeClass: string;
}[] = [
  {
    id: "todo",
    title: "未完了",
    empty: "タスクはありません",
    icon: CircleDashed,
    iconClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  {
    id: "done",
    title: "完了済み",
    empty: "完了したタスクはありません",
    icon: CircleCheckBig,
    iconClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
];

// Supabase から取得する行の形（select で指定した列だけ）
type TodoRow = {
  id: string;
  text: string;
  completed: boolean;
  comments: {
    id: string;
    text: string;
    profiles: { name: string } | null;
  }[];
};

const TODO_SELECT =
  "id, text, completed, comments(id, text, created_at, profiles(name))";

const toTodo = (row: TodoRow): Todo => ({
  id: row.id,
  text: row.text,
  completed: row.completed,
  comments: row.comments.map((comment) => ({
    id: comment.id,
    text: comment.text,
    authorName: comment.profiles?.name ?? "不明なユーザー",
  })),
});

export function TodoApp({ userName }: { userName: string }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  // タイマーやアンマウント時の処理からも最新の値を読めるように ref にも持つ
  const pendingDeleteRef = useRef<PendingDelete | null>(null);

  // マウスは少し動かしてからドラッグ開始（クリック操作と区別）、
  // タッチは長押しでドラッグ開始（スクロールと区別）
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  // RLS によって、ログイン中のユーザーのタスクだけが返ってくる
  const loadTodos = useCallback(async () => {
    const { data, error } = await createClient()
      .from("todos")
      .select(TODO_SELECT)
      .order("created_at")
      .order("created_at", { referencedTable: "comments" });
    if (error) {
      setError("タスクを読み込めませんでした。ページを再読み込みしてください");
    } else {
      // 取り消し待ちのタスクは、まだデータベースに残っていても表示しない
      const pendingId = pendingDeleteRef.current?.todo.id;
      setTodos(
        (data as unknown as TodoRow[])
          .map(toTodo)
          .filter((todo) => todo.id !== pendingId),
      );
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  // 画面は先に更新し（楽観的更新）、保存に失敗したら
  // エラーを表示してデータベースの内容を読み直す
  const save = async (
    request: PromiseLike<{ error: unknown }>,
    failedMessage: string,
  ) => {
    const { error } = await request;
    if (error) {
      setError(failedMessage);
      await loadTodos();
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = crypto.randomUUID();
    setTodos((prev) => [
      ...prev,
      { id, text: trimmed, completed: false, comments: [] },
    ]);
    setText("");
    setError(null);
    save(
      createClient().from("todos").insert({ id, text: trimmed }),
      "タスクを追加できませんでした",
    );
  };

  const setCompleted = (id: string, completed: boolean) => {
    const target = todos.find((todo) => todo.id === id);
    if (!target || target.completed === completed) return;
    setTodos((prev) =>
      prev.map((todo) => (todo.id === id ? { ...todo, completed } : todo)),
    );
    setError(null);
    save(
      createClient().from("todos").update({ completed }).eq("id", id),
      "タスクの状態を変更できませんでした",
    );
  };

  // コメントもデータベース側で一緒に削除される（on delete cascade）
  const commitDelete = (id: string) => {
    save(
      createClient().from("todos").delete().eq("id", id),
      "タスクを削除できませんでした",
    );
  };

  // 取り消し待ちの削除があれば、待たずにデータベースから削除する
  const flushPendingDelete = () => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    commitDelete(pending.todo.id);
  };

  // 画面からはすぐ消し、データベースからは猶予が過ぎてから削除する
  const deleteTodo = (id: string) => {
    const index = todos.findIndex((todo) => todo.id === id);
    if (index === -1) return;
    flushPendingDelete();
    const pending: PendingDelete = {
      todo: todos[index],
      index,
      timer: setTimeout(() => {
        pendingDeleteRef.current = null;
        setPendingDelete(null);
        commitDelete(id);
      }, UNDO_DELETE_MS),
    };
    pendingDeleteRef.current = pending;
    setPendingDelete(pending);
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
    setError(null);
  };

  const undoDelete = () => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    setTodos((prev) => {
      const next = [...prev];
      next.splice(Math.min(pending.index, next.length), 0, pending.todo);
      return next;
    });
  };

  // ログアウトなどで画面が切り替わるときは、取り消し待ちの削除を確定させる
  useEffect(() => {
    return () => {
      const pending = pendingDeleteRef.current;
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingDeleteRef.current = null;
      // then を呼ばないとリクエストが送られない
      createClient()
        .from("todos")
        .delete()
        .eq("id", pending.todo.id)
        .then(() => {});
    };
  }, []);

  const addComment = (todoId: string, text: string) => {
    const comment: Comment = {
      id: crypto.randomUUID(),
      authorName: userName,
      text,
    };
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === todoId
          ? { ...todo, comments: [...todo.comments, comment] }
          : todo,
      ),
    );
    setError(null);
    save(
      createClient()
        .from("comments")
        .insert({ id: comment.id, todo_id: todoId, text }),
      "コメントを追加できませんでした",
    );
  };

  const actions: TodoActions = {
    onToggle: setCompleted,
    onDelete: deleteTodo,
    onAddComment: addComment,
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    if (!event.over) return;
    setCompleted(String(event.active.id), event.over.id === "done");
  };

  const activeTodo = todos.find((todo) => todo.id === activeId);
  const completedCount = todos.filter((todo) => todo.completed).length;
  const progress =
    todos.length === 0 ? 0 : Math.round((completedCount / todos.length) * 100);

  return (
    <div className="w-full max-w-5xl flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              タスクボード
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {todos.length === 0
                ? "最初のタスクを追加してみましょう"
                : `${todos.length} 件中 ${completedCount} 件が完了`}
            </p>
          </div>
          {todos.length > 0 && (
            <div className="flex w-full items-center gap-3 sm:w-64">
              <div
                role="progressbar"
                aria-label="完了率"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="w-10 text-right text-sm font-semibold tabular-nums">
                {progress}%
              </span>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/80 p-2 pl-4 shadow-lg shadow-violet-500/5 backdrop-blur transition-shadow focus-within:shadow-violet-500/15 focus-within:ring-2 focus-within:ring-primary/30"
        >
          <Plus className="h-5 w-5 shrink-0 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="新しいタスクを入力"
            aria-label="新しいタスク"
            className="h-10 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0 md:text-base"
          />
          <Button
            type="submit"
            disabled={!text.trim()}
            className="h-10 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-5 text-white shadow-md shadow-violet-500/25 hover:from-violet-600 hover:to-indigo-600"
          >
            追加
          </Button>
        </form>

        {error && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
          >
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 font-medium underline-offset-4 hover:underline"
            >
              閉じる
            </button>
          </p>
        )}
      </div>

      {!loaded ? (
        <div className="flex justify-center py-16">
          <Loader2
            aria-label="タスクを読み込み中"
            className="h-6 w-6 animate-spin text-muted-foreground"
          />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="grid items-start gap-5 md:grid-cols-2">
            {COLUMNS.map((column) => (
              <Column
                key={column.id}
                column={column}
                todos={todos.filter(
                  (todo) => todo.completed === (column.id === "done"),
                )}
                actions={actions}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTodo ? <TodoCard todo={activeTodo} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {pendingDelete && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-6 z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border/60 bg-card/95 py-2.5 pl-4 pr-2 shadow-2xl shadow-violet-500/10 backdrop-blur-xl animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
        >
          <p className="min-w-0 flex-1 truncate text-sm">
            「{pendingDelete.todo.text}」を削除しました
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={undoDelete}
            className="shrink-0 rounded-xl font-semibold text-primary"
          >
            <Undo2 />
            元に戻す
          </Button>
        </div>
      )}
    </div>
  );
}

function Column({
  column,
  todos,
  actions,
}: {
  column: (typeof COLUMNS)[number];
  todos: Todo[];
  actions: TodoActions;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const Icon = column.icon;

  return (
    <section
      ref={setNodeRef}
      aria-label={column.title}
      className={cn(
        "flex flex-col rounded-3xl border border-border/60 bg-card/50 p-3 shadow-sm backdrop-blur-xl transition-all sm:p-4",
        isOver && "border-primary/40 bg-primary/5 ring-4 ring-primary/10",
      )}
    >
      <header className="mb-3 flex items-center gap-2.5 px-1">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-lg",
            column.iconClass,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="font-semibold tracking-tight">{column.title}</h3>
        <span
          className={cn(
            "ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
            column.badgeClass,
          )}
        >
          {todos.length}
        </span>
      </header>

      <ul className="flex min-h-36 flex-1 flex-col gap-3">
        {todos.length === 0 ? (
          <li
            className={cn(
              "flex flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-border py-10 text-sm text-muted-foreground transition-colors",
              isOver && "border-primary/40 text-primary",
            )}
          >
            {column.empty}
          </li>
        ) : (
          todos.map((todo) => (
            <DraggableTodo key={todo.id} todo={todo} actions={actions} />
          ))
        )}
      </ul>
    </section>
  );
}

function DraggableTodo({
  todo,
  actions,
}: {
  todo: Todo;
  actions: TodoActions;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } =
    useDraggable({ id: todo.id });

  // カード自体を起点に登録し、チェックボックスや削除ボタン上での
  // Space / Enter でドラッグが始まらないようにする
  const ref = (node: HTMLLIElement | null) => {
    setNodeRef(node);
    setActivatorNodeRef(node);
  };

  return (
    <li
      ref={ref}
      {...attributes}
      {...listeners}
      className={cn(
        "rounded-2xl animate-in fade-in-0 slide-in-from-bottom-1 duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "opacity-30",
      )}
    >
      <TodoCard todo={todo} actions={actions} />
    </li>
  );
}

function TodoCard({
  todo,
  actions,
  overlay = false,
}: {
  todo: Todo;
  actions?: TodoActions;
  overlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-all duration-200",
        overlay
          ? "cursor-grabbing rotate-2 scale-[1.02] shadow-2xl shadow-violet-500/20"
          : "cursor-grab hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-violet-500/10",
      )}
    >
      {/* 左端のアクセントライン */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          todo.completed
            ? "bg-emerald-400/70"
            : "bg-gradient-to-b from-violet-500 to-indigo-500",
        )}
      />
      <div className="flex items-start gap-3 p-4 pl-5">
        <Checkbox
          id={overlay ? undefined : `todo-${todo.id}`}
          checked={todo.completed}
          onCheckedChange={(checked) =>
            actions?.onToggle(todo.id, checked === true)
          }
          className={cn(
            "mt-0.5 h-5 w-5 rounded-full border-2 border-muted-foreground/40 transition-colors hover:border-primary",
            "data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white",
          )}
        />
        <label
          htmlFor={overlay ? undefined : `todo-${todo.id}`}
          className={cn(
            "flex-1 cursor-pointer text-[15px] font-medium leading-snug break-words transition-colors",
            todo.completed &&
              "text-muted-foreground line-through decoration-muted-foreground/50",
          )}
        >
          {todo.text}
        </label>
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/60" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-my-1 h-7 w-7 shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          onClick={() => actions?.onDelete(todo.id)}
          aria-label={`「${todo.text}」を削除`}
        >
          <Trash2 />
        </Button>
      </div>
      <CommentSection
        todo={todo}
        onAddComment={overlay ? undefined : actions?.onAddComment}
      />
    </div>
  );
}

function CommentSection({
  todo,
  onAddComment,
}: {
  todo: Todo;
  onAddComment?: (id: string, text: string) => void;
}) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAddComment?.(todo.id, trimmed);
    setText("");
  };

  return (
    // コメント欄の操作（文字選択など）でカードのドラッグが始まらないようにする
    <div
      className="flex cursor-default flex-col gap-2.5 border-t border-border/60 bg-muted/30 px-4 py-3 pl-5"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MessageCircle className="h-3.5 w-3.5" />
        コメント
        {todo.comments.length > 0 && (
          <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary tabular-nums">
            {todo.comments.length}
          </span>
        )}
      </p>

      {todo.comments.length === 0 ? (
        <p className="text-xs text-muted-foreground/80">コメントはありません</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {todo.comments.map((comment) => (
            <li key={comment.id} className="flex items-start gap-2">
              <UserAvatar
                name={comment.authorName}
                className="h-6 w-6 text-[10px]"
              />
              <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-muted px-3 py-2 text-xs">
                <p className="font-semibold">{comment.authorName}</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words leading-relaxed text-foreground/80">
                  {comment.text}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {onAddComment && (
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-1 rounded-full border border-border/70 bg-background py-1 pl-3 pr-1 transition-shadow focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="コメントを入力"
            aria-label={`「${todo.text}」へのコメント`}
            className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0 md:text-xs"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!text.trim()}
            aria-label="コメントを追加"
            className="h-7 w-7 shrink-0 rounded-full"
          >
            <ArrowUp />
          </Button>
        </form>
      )}
    </div>
  );
}
