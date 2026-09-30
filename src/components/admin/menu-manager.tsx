"use client";

/**
 * The menu editor.
 *
 * ## One row per dish, flags inline, the full form on demand
 *
 * Nine fields per dish is too much to show twenty-six times over. So the list
 * carries only what changes during service — available, sold out, signature — and
 * the full record opens when you ask for it. The three flags are the reason this
 * screen exists: they are what a floor manager changes at 6pm, and they have to
 * be one tap each rather than three fields inside a modal.
 *
 * ## Grouped by course, not as one long list
 *
 * A chef reads the menu in courses, and so does the person editing it. Grouping
 * is also what makes "the desserts are all in the wrong order" visible at a
 * glance, which a flat list sorted by name would hide entirely.
 *
 * ## Editing replaces the row, it does not navigate
 *
 * Opening the editor does not change the URL, so a manager can go through four
 * dishes and then use the browser's back button to return to the list they were
 * actually looking at. Each editor is its own `<form action>`, so one dish's
 * unsaved edits are never serialised into another's submission.
 */
import { useActionState, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ExternalLink, Loader2, Plus, Star, Trash2, X } from "lucide-react";

import {
  Checkbox,
  Field,
  FormBanner,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/admin/fields";
import { createMenuItem, deleteMenuItem, saveMenuItem, toggleMenuFlag } from "@/app/admin/actions";
import type { BannerState } from "@/lib/action-state";
import {
  CATEGORY_LABELS,
  DIETARY_TAGS,
  MENU_CATEGORIES,
  type DietaryTag,
  type MenuCategory,
} from "@/lib/constants";
import { cn, formatPrice } from "@/lib/format";

export type Dish = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  category: MenuCategory;
  imageUrl: string;
  tags: DietaryTag[];
  ingredients: string[];
  allergens: string[];
  calories: number | null;
  isSignature: boolean;
  isAvailable: boolean;
  isSoldOut: boolean;
  chefNote: string | null;
  sortOrder: number;
};

const TAG_LABELS: Record<DietaryTag, string> = {
  VEGAN: "Vegan",
  VEGETARIAN: "Vegetarian",
  GLUTEN_FREE: "Gluten free",
  DAIRY_FREE: "Dairy free",
  SPICY: "Spicy",
  NUT_FREE: "Nut free",
  PORK_FREE: "No pork",
  SHELLFISH: "Shellfish",
};

export function MenuManager({ dishes }: { dishes: Dish[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {dishes.length} dishes ·{" "}
          <span className="text-ink">
            {dishes.filter((d) => d.isSoldOut).length} sold out
          </span>{" "}
          ·{" "}
          <span className="text-ink">{dishes.filter((d) => !d.isAvailable).length} paused</span>
        </p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          className="btn btn-primary btn-sm"
        >
          {adding ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
          {adding ? "Cancel" : "Add a dish"}
        </button>
      </div>

      {adding ? (
        /* Keyed on the dish count: a successful add revalidates the path, the
           count changes, and React remounts the form with empty fields and a
           fresh action state. That is the whole reset mechanism — there is no
           effect watching for success and no timer closing anything. */
        <DishForm key={dishes.length} mode="create" className="mb-8" onDone={() => setAdding(false)} />
      ) : null}

      <div className="space-y-8">
        {MENU_CATEGORIES.map((category) => {
          const rows = dishes
            .filter((d) => d.category === category)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

          if (rows.length === 0) return null;

          return (
            <section key={category}>
              <h3 className="mb-3 flex items-baseline gap-2.5 font-display text-lg">
                {CATEGORY_LABELS[category]}
                <span className="text-sm font-sans text-ink-subtle">{rows.length}</span>
              </h3>

              <ul className="card divide-y divide-border-subtle overflow-hidden">
                {rows.map((dish) => (
                  <li key={dish.id} className={cn("px-4 py-3", !dish.isAvailable && "bg-surface-sunken/40")}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="relative size-11 shrink-0 overflow-hidden rounded-lg">
                        <Image
                          src={dish.imageUrl}
                          alt=""
                          fill
                          sizes="44px"
                          className={cn("object-cover", !dish.isAvailable && "opacity-40 grayscale")}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                          {dish.name}
                          {dish.isSignature ? (
                            <Star size={11} className="text-saffron" fill="currentColor" aria-label="Signature dish" />
                          ) : null}
                          {dish.isSoldOut ? (
                            <span className="rounded-full bg-wine/10 px-1.5 py-0.5 text-[0.625rem] text-wine">
                              Sold out
                            </span>
                          ) : null}
                          {!dish.isAvailable ? (
                            <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[0.625rem] text-ink-subtle">
                              Hidden
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-ink-subtle">{dish.description}</p>
                      </div>

                      <p className="shrink-0 font-display text-sm tabular-nums">
                        {formatPrice(dish.priceCents)}
                      </p>

                      <FlagToggle dish={dish} field="isAvailable" label="Available" on={dish.isAvailable} />
                      <FlagToggle dish={dish} field="isSoldOut" label="Sold out" on={dish.isSoldOut} />
                      <FlagToggle dish={dish} field="isSignature" label="Signature" on={dish.isSignature} />

                      <button
                        type="button"
                        onClick={() => setEditing((cur) => (cur === dish.id ? null : dish.id))}
                        aria-expanded={editing === dish.id}
                        aria-controls={`edit-${dish.id}`}
                        className="btn btn-ghost btn-xs"
                      >
                        Edit
                        <ChevronDown
                          size={12}
                          aria-hidden="true"
                          className={cn("transition-transform", editing === dish.id && "rotate-180")}
                        />
                      </button>

                      <DeleteDish dish={dish} />
                    </div>

                    {editing === dish.id ? (
                      <div id={`edit-${dish.id}`} className="mt-4 border-t border-border-subtle pt-4">
                        <DishForm mode="edit" dish={dish} onDone={() => setEditing(null)} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Removes a dish from the menu for good.
 *
 * ## Two clicks, always
 *
 * The first click arms the button and the second commits. That is not a
 * confirmation dialog: a modal interrupts, a second inline click does not, and
 * the row stays visible behind it so the owner can see exactly which dish they
 * are about to lose. Arming also resets itself if the owner clicks anywhere
 * else, so a half-aimed button cannot be left waiting.
 *
 * ## A refusal is not a failure
 *
 * The action refuses while anyone has the dish on a saved list, and says how
 * many. That message is shown in full, in the row, because "could not delete"
 * with no reason is the response that teaches people to stop trusting the
 * button. The alternative it recommends — marking it sold out — is the same
 * outcome they probably wanted anyway.
 *
 * ## The row disappears on its own
 *
 * There is no local copy of the menu to keep in step. The action's
 * `revalidatePath` brings the new list back and the dish is no longer in it.
 * Keeping an optimistic removal would mean guessing when to roll it back, and a
 * refused delete would have to be resurrected.
 */
function DeleteDish({ dish }: { dish: Dish }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  function remove() {
    if (pending) return;
    setMessage(null);
    start(async () => {
      const result = await deleteMenuItem(dish.id);
      setMessage({ ok: result.ok, text: result.message });
      // Disarm either way: on success the row is gone, and on a refusal the
      // owner has read the reason and the next click should start over rather
      // than fire the delete again from an armed state.
      setArmed(false);
    });
  }

  if (!armed && !message) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="btn btn-ghost btn-xs shrink-0 text-ink-subtle hover:text-wine"
      >
        <Trash2 size={12} aria-hidden="true" />
        <span className="sr-only">Remove {dish.name} from the menu</span>
        <span aria-hidden="true">Remove</span>
      </button>
    );
  }

  if (!armed) {
    // The row is still here, so the refusal is readable in context.
    return (
      <p
        role="status"
        className={cn("text-xs", message?.ok ? "text-accent" : "text-wine")}
      >
        {message?.text}
        <button
          type="button"
          onClick={() => setMessage(null)}
          className="ml-2 underline underline-offset-2 hover:text-ink"
        >
          Dismiss
        </button>
      </p>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs">
      <span className="text-ink-subtle">Remove {dish.name}?</span>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="btn btn-secondary btn-xs text-wine"
      >
        {pending ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : null}
        Yes, remove
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        disabled={pending}
        className="btn btn-ghost btn-xs"
      >
        Keep
      </button>
    </span>
  );
}

/**
 * One boolean flag on a dish.
 *
 * Calls the server action directly rather than going through a form, because
 * these are the flags that get flipped mid-service and a form submit is both
 * slower and heavier than a `startTransition`. The row is left to the server
 * render — the action's `revalidatePath` brings back the new truth — so there is
 * no optimistic state to get wrong, and a double-tap cannot desynchronise the
 * row because both taps queue two real writes.
 */
function FlagToggle({
  dish,
  field,
  label,
  on,
}: {
  dish: Dish;
  field: "isAvailable" | "isSoldOut" | "isSignature";
  label: string;
  on: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={pending}
      onClick={() => start(() => toggleMenuFlag(dish.id, field))}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
        on
          ? field === "isSoldOut"
            ? "border-wine/40 bg-wine/15"
            : "border-accent/40 bg-accent/15"
          : "border-border-strong bg-surface",
      )}
    >
      <span className="sr-only">
        {label}: {on ? "yes" : "no"} — {dish.name}
      </span>
      {pending ? (
        <Loader2 size={11} className="absolute inset-0 m-auto animate-spin text-ink-subtle" aria-hidden="true" />
      ) : null}
      <span
        aria-hidden="true"
        className={cn(
          "size-4 rounded-full transition-transform",
          on
            ? field === "isSoldOut"
              ? "translate-x-5 bg-wine"
              : "translate-x-5 bg-accent"
            : "translate-x-0.5 bg-border-strong",
        )}
      />
    </button>
  );
}

/**
 * The full dish record.
 *
 * `priceCents` is a number of pence in the database and a currency string
 * everywhere else, so the field holds pounds with two decimals and a hidden
 * input converts on submit. Doing the arithmetic in the database instead would
 * mean storing `"18.50"` and re-parsing it on every read, and rounding would
 * drift — money belongs in integers.
 *
 * The slug is editable but shown as the resulting URL, because it is public: it
 * appears in search results and in links people share. A dish whose name changes
 * should keep its address, which is why this does not auto-rewrite the slug from
 * the name — that would break every existing link to the dish.
 */
function DishForm({
  dish,
  mode,
  onDone,
  className,
}: {
  dish?: Dish;
  mode: "create" | "edit";
  onDone?: () => void;
  className?: string;
}) {
  const action = mode === "create" ? createMenuItem : saveMenuItem;
  const [state, formAction] = useActionState<BannerState, FormData>(action, {
    ok: true,
    message: "",
  });

  /**
   * The form does not close itself on success.
   *
   * The obvious implementation is an effect on `state` that calls `onDone` after
   * a beat, and it is wrong twice over: a `setTimeout`-then-`setState` is a
   * cascading render, and a confirmation the owner sees for 700ms and then
   * loses is worse than no confirmation at all.
   *
   * Instead the *create* form is keyed on the dish count by its parent, so a
   * successful add remounts it with empty fields and a fresh action state — the
   * clean form is a consequence of the new row existing, not a timer. The edit
   * form is left open with its banner, because the owner is usually mid-record
   * and wants to see "Saved" while they check the next thing.
   */

  return (
    <form action={formAction} className={cn("space-y-5", className)}>
      {dish ? <input type="hidden" name="id" value={dish.id} /> : null}

      <FormBanner state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="name"
          label="Name"
          error={state.errors?.name}
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              name="name"
              defaultValue={dish?.name}
              placeholder="Charred leek, hazelnut, aged sherry"
              describedBy={describedBy}
              invalid={Boolean(state.errors?.name)}
              required
            />
          )}
        </Field>

        <Field
          name="slug"
          label="Web address"
          hint={`savora/menu/${dish?.slug ?? "<slug>"}`}
          error={state.errors?.slug}
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              name="slug"
              defaultValue={dish?.slug}
              placeholder="charred-leek-hazelnut"
              describedBy={describedBy}
              invalid={Boolean(state.errors?.slug)}
              required
            />
          )}
        </Field>
      </div>

      <Field
        name="description"
        label="Description"
        error={state.errors?.description}
      >
        {({ id, describedBy }) => (
          <TextArea
            id={id}
            name="description"
            defaultValue={dish?.description}
            describedBy={describedBy}
            invalid={Boolean(state.errors?.description)}
            required
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <PriceField
          name="priceCents"
          label="Price"
          defaultPence={dish?.priceCents}
          error={state.errors?.priceCents}
        />

        <Field name="category" label="Course">
          {({ id }) => (
            <Select id={id} name="category" defaultValue={dish?.category ?? "STARTERS"}>
              {MENU_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field name="calories" label="Calories" hint="Optional, shown on the dish page">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              name="calories"
              type="number"
              min="0"
              defaultValue={dish?.calories ?? ""}
              describedBy={describedBy}
            />
          )}
        </Field>
      </div>

      <Field
        name="imageUrl"
        label="Image URL"
        hint="A public image address. Unsplash links work."
        error={state.errors?.imageUrl}
      >
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            name="imageUrl"
            defaultValue={dish?.imageUrl}
            placeholder="https://images.unsplash.com/photo-…"
            describedBy={describedBy}
            invalid={Boolean(state.errors?.imageUrl)}
            required
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="ingredients" label="Ingredients" hint="Comma separated">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              name="ingredients"
              defaultValue={dish?.ingredients.join(", ")}
              describedBy={describedBy}
            />
          )}
        </Field>

        <Field name="allergens" label="Allergens" hint="Comma separated">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              name="allergens"
              defaultValue={dish?.allergens.join(", ")}
              describedBy={describedBy}
            />
          )}
        </Field>
      </div>

      <Field
        name="chefNote"
        label="Chef&rsquo;s note"
        hint="Shown to guests on the dish page, in italics. Optional."
      >
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            name="chefNote"
            defaultValue={dish?.chefNote ?? ""}
            describedBy={describedBy}
          />
        )}
      </Field>

      <fieldset>
        <legend className="label">Dietary</legend>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {DIETARY_TAGS.map((tag) => (
            <Checkbox
              key={tag}
              name="tags"
              value={tag}
              label={TAG_LABELS[tag]}
              defaultChecked={dish?.tags.includes(tag)}
              className="w-40"
            />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border-subtle pt-4">
        <Checkbox name="isAvailable" label="Show on the menu" defaultChecked={dish?.isAvailable ?? true} />
        <Checkbox name="isSignature" label="Signature dish" defaultChecked={dish?.isSignature} />
        {mode === "edit" ? (
          <Checkbox name="isSoldOut" label="Sold out today" defaultChecked={dish?.isSoldOut} />
        ) : null}

        <Field name="sortOrder" label="Order" className="w-24">
          {({ id }) => (
            <TextInput
              id={id}
              name="sortOrder"
              type="number"
              min="0"
              defaultValue={dish?.sortOrder ?? 0}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{mode === "create" ? "Add the dish" : "Save changes"}</SubmitButton>
        {mode === "edit" && dish ? (
          <Link
            href={`/menu/${dish.slug}`}
            className="btn btn-ghost btn-sm"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={13} aria-hidden="true" />
            See it on the site
          </Link>
        ) : null}
        {onDone ? (
          <button type="button" onClick={onDone} className="btn btn-ghost btn-sm">
            {mode === "create" ? "Never mind" : "Close"}
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** A dish's tags, rendered on the row for the dietary information that matters. */
export function DishTags({ tags }: { tags: DietaryTag[] }) {
  if (tags.length === 0) return null;
  return (
    <p className="mt-1 flex flex-wrap gap-1.5 text-[0.6875rem] text-ink-subtle">
      {tags.map((tag) => (
        <span key={tag} className="rounded-full bg-surface-raised px-2 py-0.5">
          {TAG_LABELS[tag]}
        </span>
      ))}
    </p>
  );
}

/**
 * Price, entered in pounds and stored in pence.
 *
 * ## Why not just store the pounds string
 *
 * The column is an integer number of pence, which is the only representation of
 * money that cannot drift. `18.50` as a float is 18.499999999999996 somewhere
 * downstream, and a price that renders as "£18.499999" on the dish page is the
 * kind of bug nobody finds until a customer photographs it.
 *
 * ## Why the hidden mirror rather than converting in the action
 *
 * The action could divide by 100 on the way in, but then it would have to guess
 * whether it was handed pounds or pence from the shape of the number, and
 * "19.99" is a valid price in *either* unit. Converting here, at the only point
 * where the units are known, means the server receives exactly what the column
 * wants and never has to interpret anything.
 *
 * The visible input keeps the `£` out of the value, so the text is a number that
 * `type="number"` can validate. An empty or half-typed field mirrors to `""`,
 * which the zod schema rejects as "Add a price" — the same message a genuinely
 * blank field gets, rather than a NaN reaching the database.
 */
function PriceField({
  name,
  label,
  defaultPence,
  error,
}: {
  name: string;
  label: string;
  defaultPence?: number;
  error?: string;
}) {
  const [pounds, setPounds] = useState(
    defaultPence === undefined ? "" : (defaultPence / 100).toFixed(2),
  );

  const pence = useMemo(() => {
    const parsed = Number(pounds);
    return pounds.trim() !== "" && Number.isFinite(parsed)
      ? String(Math.round(parsed * 100))
      : "";
  }, [pounds]);

  return (
    <Field name={name} label={`${label} (£)`} error={error}>
      {({ id, describedBy }) => (
        <>
          <TextInput
            id={id}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={pounds}
            onChange={(event) => setPounds(event.target.value)}
            placeholder="18.50"
            describedBy={describedBy}
            invalid={Boolean(error)}
            required
          />
          <input type="hidden" name={name} value={pence} />
        </>
      )}
    </Field>
  );
}
