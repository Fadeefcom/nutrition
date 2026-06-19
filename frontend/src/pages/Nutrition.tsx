import {
  Barcode,
  Camera,
  Check,
  ChevronDown,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { FocusEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { ProgressRing } from '../components/ProgressRing';
import { Skeleton } from '../components/Skeleton';
import type { DailyNutrition, Product, Settings } from '../types/models';
import { entryFromProduct, macroTargets, normalizeNutrition, round } from '../utils/calculations';
import { toIsoDate } from '../utils/date';

const now = () => new Date().toISOString();

function blankProduct(seed = ''): Product {
  const trimmed = seed.trim();
  const barcode = isBarcodeLike(trimmed) ? trimmed : '';
  return {
    id: crypto.randomUUID(),
    name: barcode ? '' : trimmed,
    brand: '',
    barcode,
    servingSizeGrams: 100,
    caloriesPer100g: 0,
    proteinPer100g: 0,
    carbsPer100g: 0,
    fatPer100g: 0,
    fiberPer100g: 0,
    source: 'manual',
    notes: '',
    createdAt: now(),
    updatedAt: now(),
  };
}

export default function Nutrition() {
  const [date, setDate] = useState(toIsoDate());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [day, setDay] = useState<DailyNutrition | null>(null);
  const [mealType, setMealType] = useState('breakfast');
  const [productId, setProductId] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [productForm, setProductForm] = useState<Product>(() => blankProduct());
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [grams, setGrams] = useState(100);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productSaving, setProductSaving] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [nextSettings, nextProducts, nextDay] = await Promise.all([
          api.settings(),
          api.products(),
          api.nutrition(date),
        ]);
        setSettings(nextSettings);
        setProducts(nextProducts);
        setProductId('');
        setProductQuery('');
        setProductFormOpen(false);
        setDay(normalizeNutrition(nextDay));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load nutrition.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [date]);

  const targets = useMemo(() => (settings ? macroTargets(settings.nutritionTarget) : null), [settings]);
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [productId, products],
  );

  const save = async () => {
    if (!day) return;
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveNutrition(date, normalizeNutrition(day));
      setDay(normalizeNutrition(saved));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save nutrition.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-[70vh]" />;
  }

  if (!settings || !day || !targets) {
    return <EmptyState title={error || 'Nutrition unavailable'} />;
  }

  const normalized = normalizeNutrition(day);

  return (
    <div className="space-y-5">
      <section className="panel p-4">
        <div className="grid gap-3 md:grid-cols-[10rem_1fr_auto]">
          <input className="field" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <input
            className="field"
            value={day.notes}
            onChange={(event) => setDay({ ...day, notes: event.target.value })}
            placeholder="Daily notes"
          />
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            <Save size={17} />
            {saving ? 'Saving' : 'Save'}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm font-semibold text-ember">{error}</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="panel p-4">
          <ProgressRing
            value={round((normalized.totals.calories / targets.calories) * 100)}
            label="Calories"
            sublabel={`${Math.round(normalized.totals.calories)} / ${targets.calories} kcal`}
            tone="ember"
          />
        </div>
        <div className="panel p-4">
          <ProgressRing
            value={round((normalized.totals.protein / targets.proteinGrams) * 100)}
            label="Protein"
            sublabel={`${normalized.totals.protein} / ${targets.proteinGrams} g`}
            tone="mint"
          />
        </div>
        <div className="panel p-4">
          <ProgressRing
            value={round((normalized.totals.carbs / targets.carbsGrams) * 100)}
            label="Carbs"
            sublabel={`${normalized.totals.carbs} / ${targets.carbsGrams} g`}
            tone="lagoon"
          />
        </div>
        <div className="panel p-4">
          <ProgressRing
            value={round((normalized.totals.fat / targets.fatGrams) * 100)}
            label="Fat"
            sublabel={`${normalized.totals.fat} / ${targets.fatGrams} g`}
            tone="honey"
          />
        </div>
        <div className="panel p-4">
          <ProgressRing
            value={round((normalized.totals.fiber / targets.fiberGrams) * 100)}
            label="Fiber"
            sublabel={`${normalized.totals.fiber} / ${targets.fiberGrams} g`}
            tone="mint"
          />
        </div>
      </section>

      <section className="panel relative z-40 p-4">
        <div className="grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)_8rem_auto]">
          <select className="field" value={mealType} onChange={(event) => setMealType(event.target.value)}>
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </select>

          <SmartProductInput
            products={products}
            query={productQuery}
            selectedProductId={productId}
            barcodeLoading={barcodeLoading}
            onQueryChange={(query) => {
              setProductQuery(query);
              setProductId('');
            }}
            onSelectProduct={(product) => {
              setProductId(product.id);
              setProductQuery(productLabel(product));
              setProductFormOpen(false);
            }}
            onCreateFromQuery={() => openProductDraft(productQuery)}
            onBarcodeLookup={lookupBarcode}
            onCameraCapture={openCameraDraft}
          />

          <label className="relative">
            <span className="sr-only">Grams</span>
            <input
              className="field w-full pr-9 text-right"
              type="number"
              min="1"
              value={grams}
              onChange={(event) => setGrams(Number(event.target.value))}
              placeholder="100"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-zinc-400">
              g
            </span>
          </label>

          <button className="btn btn-primary" onClick={addEntry} disabled={!selectedProduct}>
            <Plus size={17} />
            Add
          </button>
        </div>

        {productFormOpen ? (
          <ProductEditor
            product={productForm}
            saving={productSaving}
            exists={products.some((product) => product.id === productForm.id)}
            onChange={setProductForm}
            onClose={() => setProductFormOpen(false)}
            onSave={saveProduct}
          />
        ) : null}
      </section>

      <section className="panel relative z-0 p-4">
        <h2 className="mb-4 text-xl font-black">Entries</h2>
        {normalized.entries.length === 0 ? (
          <EmptyState title="No food logged for this day" />
        ) : (
          <div className="space-y-2">
            {normalized.entries.map((entry) => (
              <div
                key={entry.id}
                className="grid gap-2 rounded-lg border border-black/10 p-3 dark:border-white/10 md:grid-cols-[1fr_5rem_5rem_5rem_5rem_auto]"
              >
                <div>
                  <p className="font-bold">{entry.productName}</p>
                  <p className="text-xs uppercase text-zinc-500 dark:text-zinc-400">{entry.mealType}</p>
                </div>
                <Metric label="g" value={entry.grams} />
                <Metric label="kcal" value={entry.calories} />
                <Metric label="P" value={entry.protein} />
                <Metric label="C/F" value={`${entry.carbs}/${entry.fat}`} />
                <button className="btn btn-ghost h-11 w-11 px-0" onClick={() => removeEntry(entry.id)} title="Delete entry">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  function addEntry() {
    if (!selectedProduct || !day) return;
    setDay((current) =>
      current
        ? { ...current, entries: [...current.entries, entryFromProduct(selectedProduct, grams, mealType)] }
        : current,
    );
  }

  function removeEntry(id: string) {
    setDay((current) =>
      current ? { ...current, entries: current.entries.filter((entry) => entry.id !== id) } : current,
    );
  }

  function openProductDraft(seed: string, patch: Partial<Product> = {}) {
    setProductId('');
    setProductForm({
      ...blankProduct(seed),
      ...patch,
      id: patch.id || crypto.randomUUID(),
      createdAt: patch.createdAt || now(),
      updatedAt: patch.updatedAt || now(),
    });
    setProductFormOpen(true);
  }

  async function lookupBarcode(rawBarcode?: string) {
    const barcode = (rawBarcode ?? productQuery).trim();
    if (!barcode) {
      setError('Enter or scan a barcode first.');
      return;
    }

    setBarcodeLoading(true);
    setError('');
    try {
      const imported = await api.barcode(barcode);
      const existing = products.find(
        (product) => product.id === imported.id || (imported.barcode && product.barcode === imported.barcode),
      );
      setProductForm({
        ...blankProduct(barcode),
        ...imported,
        id: existing?.id ?? imported.id ?? crypto.randomUUID(),
        barcode: imported.barcode || barcode,
        source: imported.source || 'barcode',
        createdAt: existing?.createdAt ?? imported.createdAt ?? now(),
        updatedAt: imported.updatedAt ?? now(),
      });
      setProductId('');
      setProductQuery(imported.barcode || barcode);
      setProductFormOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Barcode lookup failed.');
      openProductDraft(barcode, { barcode, source: 'manual' });
    } finally {
      setBarcodeLoading(false);
    }
  }

  function openCameraDraft(file?: File | null) {
    const query = productQuery.trim();
    openProductDraft(query, {
      source: 'ai-photo',
      notes: file
        ? `Photo draft: ${file.name}. Validate nutrition values before saving.`
        : 'Photo draft. Validate nutrition values before saving.',
    });
  }

  async function saveProduct() {
    const product = {
      ...productForm,
      name: productForm.name.trim(),
      brand: productForm.brand.trim(),
      barcode: productForm.barcode.trim(),
      updatedAt: now(),
    };

    if (!product.name) {
      setError('Product name is required.');
      return;
    }

    setProductSaving(true);
    setError('');
    try {
      const exists = products.some((item) => item.id === product.id);
      const saved = exists ? await api.updateProduct(product) : await api.createProduct(product);
      setProducts((items) =>
        exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [...items, saved],
      );
      setProductId(saved.id);
      setProductQuery(productLabel(saved));
      setProductForm(saved);
      setProductFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setProductSaving(false);
    }
  }
}

function SmartProductInput({
  products,
  query,
  selectedProductId,
  barcodeLoading,
  onQueryChange,
  onSelectProduct,
  onCreateFromQuery,
  onBarcodeLookup,
  onCameraCapture,
}: {
  products: Product[];
  query: string;
  selectedProductId: string;
  barcodeLoading: boolean;
  onQueryChange: (query: string) => void;
  onSelectProduct: (product: Product) => void;
  onCreateFromQuery: () => void;
  onBarcodeLookup: (barcode?: string) => void;
  onCameraCapture: (file?: File | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = normalizedQuery
    ? products.filter((product) =>
        [product.name, product.brand, product.barcode, product.source]
          .filter(Boolean)
          .some((part) => part.toLowerCase().includes(normalizedQuery)),
      )
    : products.slice(0, 12);
  const exactProduct = normalizedQuery
    ? products.find((product) =>
        [productLabel(product), product.name, product.barcode].some(
          (part) => part.trim().toLowerCase() === normalizedQuery,
        ),
      )
    : undefined;
  const canCreate = Boolean(query.trim() && !exactProduct);

  const closeIfFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setOpen(false);
  };

  return (
    <div className="relative min-w-0" onBlur={closeIfFocusLeaves}>
      <div className="field flex items-center gap-2 px-2">
        <Search size={16} className="shrink-0 text-zinc-400" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (exactProduct) {
                onSelectProduct(exactProduct);
                setOpen(false);
              } else if (isBarcodeLike(query)) {
                setOpen(false);
                onBarcodeLookup(query);
              } else if (canCreate) {
                setOpen(false);
                onCreateFromQuery();
              }
            }
          }}
          placeholder="Search product, type barcode, or create new"
        />
        <button
          className="btn btn-ghost h-8 w-8 shrink-0 px-0"
          disabled={barcodeLoading}
          onClick={() => {
            setOpen(false);
            onBarcodeLookup(query);
          }}
          title="Barcode lookup"
          type="button"
        >
          <Barcode size={15} />
        </button>
        <button
          className="btn btn-ghost h-8 w-8 shrink-0 px-0"
          onClick={() => fileInputRef.current?.click()}
          title="Photo AI draft"
          type="button"
        >
          <Camera size={15} />
        </button>
        <button
          className="h-8 w-6 shrink-0 text-zinc-500 dark:text-zinc-400"
          onClick={() => setOpen((current) => !current)}
          title="Open products"
          type="button"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          setOpen(false);
          onCameraCapture(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-80 overflow-hidden rounded-lg border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#191b1f]">
          <div className="max-h-56 overflow-y-auto py-1">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <button
                  key={product.id}
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => {
                    onSelectProduct(product);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{productLabel(product)}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {[product.barcode, `${product.caloriesPer100g} kcal / 100g`].filter(Boolean).join(' | ')}
                    </span>
                  </span>
                  {product.id === selectedProductId ? <Check size={15} className="shrink-0 text-mint" /> : null}
                </button>
              ))
            ) : (
              <p className="px-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">No products found</p>
            )}
          </div>

          <div className="sticky bottom-0 border-t border-black/10 bg-white p-2 dark:border-white/10 dark:bg-[#191b1f]">
            {isBarcodeLike(query) ? (
              <button
                className="btn btn-ghost h-9 w-full justify-start"
                onClick={() => {
                  setOpen(false);
                  onBarcodeLookup(query);
                }}
                type="button"
              >
                <Barcode size={15} />
                Lookup barcode {query.trim()}
              </button>
            ) : (
              <button
                className="btn btn-ghost h-9 w-full justify-start"
                disabled={!canCreate}
                onClick={() => {
                  setOpen(false);
                  onCreateFromQuery();
                }}
                type="button"
              >
                <Plus size={15} />
                {canCreate ? `Create "${query.trim()}"` : 'Type to create product'}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProductEditor({
  product,
  saving,
  exists,
  onChange,
  onClose,
  onSave,
}: {
  product: Product;
  saving: boolean;
  exists: boolean;
  onChange: (product: Product) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-black/10 bg-black/5 p-3 dark:border-white/10 dark:bg-white/10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">{exists ? 'Review product' : 'Create product'}</h3>
          <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{product.source}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary h-9" disabled={saving} onClick={onSave}>
            <Save size={15} />
            {saving ? 'Saving' : 'Save product'}
          </button>
          <button className="btn btn-ghost h-9 w-9 px-0" onClick={onClose} title="Close">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <TextField label="Name" value={product.name} onChange={(name) => onChange({ ...product, name })} />
        <TextField label="Brand" value={product.brand} onChange={(brand) => onChange({ ...product, brand })} />
        <TextField label="Barcode" value={product.barcode} onChange={(barcode) => onChange({ ...product, barcode })} />
        <NumberField
          label="Serving grams"
          value={product.servingSizeGrams}
          onChange={(servingSizeGrams) => onChange({ ...product, servingSizeGrams })}
        />
        <NumberField
          label="Calories / 100g"
          value={product.caloriesPer100g}
          onChange={(caloriesPer100g) => onChange({ ...product, caloriesPer100g })}
        />
        <NumberField
          label="Protein / 100g"
          value={product.proteinPer100g}
          onChange={(proteinPer100g) => onChange({ ...product, proteinPer100g })}
        />
        <NumberField
          label="Carbs / 100g"
          value={product.carbsPer100g}
          onChange={(carbsPer100g) => onChange({ ...product, carbsPer100g })}
        />
        <NumberField
          label="Fat / 100g"
          value={product.fatPer100g}
          onChange={(fatPer100g) => onChange({ ...product, fatPer100g })}
        />
        <NumberField
          label="Fiber / 100g"
          value={product.fiberPer100g}
          onChange={(fiberPer100g) => onChange({ ...product, fiberPer100g })}
        />
      </div>
      <textarea
        className="field mt-3 min-h-20 w-full py-3"
        value={product.notes}
        onChange={(event) => onChange({ ...product, notes: event.target.value })}
        placeholder="Notes"
      />
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-bold">
      <span className="mb-1 block text-zinc-500 dark:text-zinc-400">{label}</span>
      <input className="field w-full" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm font-bold">
      <span className="mb-1 block text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        className="field w-full"
        type="number"
        min="0"
        step="0.1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

function productLabel(product: Product) {
  return [product.brand, product.name].filter(Boolean).join(' ') || product.barcode || 'Unnamed product';
}

function isBarcodeLike(value: string) {
  return /^\d{6,}$/.test(value.trim());
}
