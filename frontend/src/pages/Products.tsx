import { Plus, Save, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { BarcodeScannerButton } from '../components/BarcodeScannerButton';
import { BaseDropdown, type DropdownOption } from '../components/BaseDropdown';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import type { Product, ProductCustomServing } from '../types/models';

const now = () => new Date().toISOString();
const baseUnitOptions: Array<DropdownOption<string>> = [
  { label: 'g', value: 'g' },
  { label: 'ml', value: 'ml' },
  { label: 'unit', value: 'unit' },
];

function blankProduct(barcode = ''): Product {
  return {
    id: crypto.randomUUID(),
    name: '',
    brand: '',
    barcode,
    servingSizeGrams: 100,
    servingSizeAmount: 100,
    servingSizeUnit: 'g',
    customServings: [],
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

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [barcode, setBarcode] = useState('');
  const [form, setForm] = useState<Product>(() => blankProduct());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setProducts(await api.products());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return products;
    return products.filter((product) =>
      [product.name, product.brand, product.barcode].some((part) => part.toLowerCase().includes(value)),
    );
  }, [products, query]);
  const formServing = getProductServing(form);
  const formServingLabel = formatServingValue(formServing.amount, formServing.unit);

  const save = async () => {
    if (!form.name.trim()) {
      setError('Product name is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const productToSave = normalizeProductForSave(form);
      const exists = products.some((product) => product.id === productToSave.id);
      const saved = exists ? await api.updateProduct(productToSave) : await api.createProduct(productToSave);
      setProducts((items) => (exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [...items, saved]));
      setForm(blankProduct());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setSaving(false);
    }
  };

  const searchBarcode = async (overrideCode?: string) => {
    const code = (overrideCode ?? barcode).trim();
    if (!code) return;
    setError('');
    try {
      const product = await api.barcode(code);
      setForm({
        ...product,
        id: products.some((item) => item.id === product.id) ? product.id : product.id || crypto.randomUUID(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Barcode lookup failed.');
      setForm(blankProduct(code));
    }
  };

  const lookupBarcodeCode = useCallback(
    async (code: string) => {
      setError('');
      try {
        const product = await api.barcode(code);
        setForm({
          ...product,
          id: products.some((item) => item.id === product.id)
            ? product.id
            : product.id || crypto.randomUUID(),
        });
      } catch {
        // barcode not in DB — barcode field already set by BarcodeInput, just keep it
      }
    },
    [products],
  );

  const remove = async (product: Product) => {
    setError('');
    try {
      await api.deleteProduct(product.id);
      setProducts((items) => items.filter((item) => item.id !== product.id));
      if (form.id === product.id) {
        setForm(blankProduct());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete product.');
    }
  };

  if (loading) {
    return <Skeleton className="h-[70vh]" />;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="panel p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black">Products</h1>
          <button className="btn btn-ghost" onClick={() => setForm(blankProduct())}>
            New
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, brand, barcode"
          />
          <button
            className="btn btn-ghost"
            onClick={async () => {
              setProducts(await api.searchProducts(query));
            }}
          >
            <Search size={17} />
            Search
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            className="field"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            placeholder="Barcode"
          />
          <BarcodeScannerButton
            onScanSuccess={(code) => {
              setBarcode(code);
              void searchBarcode(code);
            }}
            onScanError={(scanError) => setError(scanError.message)}
          />
          <button className="btn btn-ghost" onClick={() => void searchBarcode()}>
            <Search size={17} />
            Lookup
          </button>
        </div>

        {error ? <p className="mt-3 text-sm font-semibold text-ember">{error}</p> : null}

        <div className="mt-5 space-y-2">
          {filtered.length === 0 ? (
            <EmptyState title="No products found" />
          ) : (
            filtered.map((product) => (
              <button
                key={product.id}
                className="w-full rounded-lg border border-black/10 p-3 text-left transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                onClick={() => setForm(product)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{product.name}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">{product.brand || product.source}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black">
                      {formatServingValue(getProductServing(product).amount, getProductServing(product).unit)} |{' '}
                      {formatAmount(product.caloriesPer100g)} kcal
                    </p>
                    {product.customServings?.length ? (
                      <p className="mt-1 inline-flex rounded-md bg-black/5 px-2 py-0.5 text-xs font-bold text-zinc-500 dark:bg-white/10 dark:text-zinc-300">
                        +{product.customServings.length} variants
                      </p>
                    ) : null}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="panel p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black">{form.name ? 'Edit product' : 'Create product'}</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{form.source}</p>
          </div>
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            <Save size={17} />
            {saving ? 'Saving' : 'Save'}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Input label="Brand" value={form.brand} onChange={(brand) => setForm({ ...form, brand })} />
          <BarcodeInput
            value={form.barcode}
            onChange={(value) => setForm({ ...form, barcode: value })}
            onScan={lookupBarcodeCode}
            onScanError={(message) => setError(message)}
          />
          <BaseServingControl product={form} onChange={setForm} />
          <NumberInput
            label={`Calories / ${formServingLabel}`}
            value={form.caloriesPer100g}
            onChange={(caloriesPer100g) => setForm({ ...form, caloriesPer100g })}
          />
          <NumberInput
            label={`Protein / ${formServingLabel}`}
            value={form.proteinPer100g}
            onChange={(proteinPer100g) => setForm({ ...form, proteinPer100g })}
          />
          <NumberInput
            label={`Carbs / ${formServingLabel}`}
            value={form.carbsPer100g}
            onChange={(carbsPer100g) => setForm({ ...form, carbsPer100g })}
          />
          <NumberInput
            label={`Fat / ${formServingLabel}`}
            value={form.fatPer100g}
            onChange={(fatPer100g) => setForm({ ...form, fatPer100g })}
          />
          <NumberInput
            label={`Fiber / ${formServingLabel}`}
            value={form.fiberPer100g}
            onChange={(fiberPer100g) => setForm({ ...form, fiberPer100g })}
          />
        </div>
        <CustomServingsManager product={form} onChange={setForm} />
        {products.some((product) => product.id === form.id) ? (
          <button className="btn btn-danger mt-3" onClick={() => remove(form)}>
            <Trash2 size={17} />
            Delete
          </button>
        ) : null}
      </section>
    </div>
  );
}

function BarcodeInput({
  value,
  onChange,
  onScan,
  onScanError,
}: {
  value: string;
  onChange: (value: string) => void;
  onScan: (code: string) => void;
  onScanError: (message: string) => void;
}) {
  const handleDetect = useCallback(
    (code: string) => { onChange(code); onScan(code); },
    [onChange, onScan],
  );

  return (
    <div className="text-sm font-bold">
      <span className="mb-1 block text-zinc-500 dark:text-zinc-400">Barcode</span>
      <div className="flex gap-1">
        <input
          className="field min-w-0 flex-1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="EAN-13, UPC-A, ..."
        />
        <BarcodeScannerButton
          onScanSuccess={handleDetect}
          onScanError={(error) => onScanError(error.message)}
        />
      </div>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-bold">
      <span className="mb-1 block text-zinc-500 dark:text-zinc-400">{label}</span>
      <input className="field w-full" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function BaseServingControl({ product, onChange }: { product: Product; onChange: (product: Product) => void }) {
  const serving = getProductServing(product);
  const unit = normalizeServingUnit(serving.unit) ?? 'g';
  const unitOptions = baseUnitOptions.some((option) => option.value === unit)
    ? baseUnitOptions
    : [{ label: unit, value: unit }, ...baseUnitOptions];

  const updateBaseServing = (amount: number, nextUnit: string) => {
    const normalizedUnit = normalizeServingUnit(nextUnit) ?? 'g';
    onChange({
      ...product,
      servingSizeGrams: amount,
      servingSizeAmount: amount,
      servingSizeUnit: normalizedUnit,
      customServings: (product.customServings ?? []).map((servingOption) => ({
        ...servingOption,
        unit: normalizedUnit,
      })),
    });
  };

  return (
    <label className="text-sm font-bold">
      <span className="mb-1 block text-zinc-500 dark:text-zinc-400">Base serving</span>
      <div className="flex min-w-0">
        <input
          className="field no-spinner h-10 min-h-10 w-full rounded-r-none border-r-0 text-right"
          type="number"
          min="0.001"
          step="any"
          value={serving.amount}
          onChange={(event) => {
            const amount = Number(event.target.value);
            if (Number.isFinite(amount)) {
              updateBaseServing(amount, unit);
            }
          }}
          onBlur={() => {
            if (serving.amount <= 0) {
              updateBaseServing(1, unit);
            }
          }}
        />
        <BaseDropdown
          className="w-24 shrink-0"
          triggerClassName="h-10 min-h-10 rounded-l-none border-l-0 px-2 text-xs"
          options={unitOptions}
          value={unit}
          onChange={(nextUnit) => updateBaseServing(serving.amount > 0 ? serving.amount : 1, nextUnit)}
          placeholder="unit"
        />
      </div>
    </label>
  );
}

function CustomServingsManager({ product, onChange }: { product: Product; onChange: (product: Product) => void }) {
  const baseUnit = normalizeServingUnit(getProductServing(product).unit) ?? 'g';
  const servings = product.customServings ?? [];

  const updateServings = (customServings: ProductCustomServing[]) => {
    onChange({
      ...product,
      customServings: customServings.map((serving) => ({
        ...serving,
        unit: baseUnit,
      })),
    });
  };

  const updateServing = (id: string, patch: Partial<ProductCustomServing>) => {
    updateServings(
      servings.map((serving) =>
        serving.id === id
          ? {
              ...serving,
              ...patch,
              unit: baseUnit,
            }
          : serving,
      ),
    );
  };

  return (
    <section className="mt-4 rounded-lg border border-black/10 bg-black/5 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-black">Custom Servings</h3>
        <button
          className="btn btn-ghost h-9"
          type="button"
          onClick={() =>
            updateServings([
              ...servings,
              {
                id: crypto.randomUUID(),
                name: '',
                amount: 1,
                unit: baseUnit,
              },
            ])
          }
        >
          <Plus size={15} />
          Add serving
        </button>
      </div>

      {servings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/10 px-3 py-4 text-sm font-semibold text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          No custom servings yet.
        </p>
      ) : (
        <div className="space-y-2">
          {servings.map((serving) => (
            <div
              key={serving.id}
              className="grid items-center gap-2 rounded-lg border border-black/10 bg-white/40 p-2 dark:border-white/10 dark:bg-black/10 md:grid-cols-[minmax(0,1fr)_auto_8rem_3rem_auto]"
            >
              <input
                className="field h-10 min-h-10 w-full"
                value={serving.name}
                onChange={(event) => updateServing(serving.id, { name: event.target.value })}
                placeholder="Serving name"
              />
              <span className="hidden text-sm font-black text-zinc-500 dark:text-zinc-400 md:block">=</span>
              <input
                className="field no-spinner h-10 min-h-10 w-full text-right"
                type="number"
                min="0.001"
                step="any"
                value={serving.amount}
                onChange={(event) => {
                  const amount = Number(event.target.value);
                  if (Number.isFinite(amount)) {
                    updateServing(serving.id, { amount });
                  }
                }}
                onBlur={() => {
                  if (serving.amount <= 0) {
                    updateServing(serving.id, { amount: 1 });
                  }
                }}
                placeholder="30"
              />
              <span className="rounded-lg border border-black/10 bg-black/5 px-3 py-2 text-center text-sm font-bold text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                {baseUnit}
              </span>
              <button
                className="btn btn-ghost h-10 w-10 px-0"
                type="button"
                onClick={() => updateServings(servings.filter((item) => item.id !== serving.id))}
                title="Delete serving"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NumberInput({
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
        className="field no-spinner w-full"
        type="number"
        min="0"
        step="0.1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

type ParsedServing = {
  amount: number;
  unit: string | null;
};

function getProductServing(product: Product): ParsedServing {
  const hasAdaptiveServing =
    typeof product.servingSizeAmount === 'number' && Number.isFinite(product.servingSizeAmount);
  const unit = normalizeServingUnit(product.servingSizeUnit);

  return {
    amount: hasAdaptiveServing ? product.servingSizeAmount : product.servingSizeGrams,
    unit: unit ?? 'g',
  };
}

function normalizeProductForSave(product: Product): Product {
  const serving = getProductServing(product);
  const amount = serving.amount > 0 ? serving.amount : 1;
  const unit = normalizeServingUnit(serving.unit) ?? 'g';

  return {
    ...product,
    name: product.name.trim(),
    brand: product.brand.trim(),
    barcode: product.barcode.trim(),
    servingSizeGrams: amount,
    servingSizeAmount: amount,
    servingSizeUnit: unit,
    customServings: (product.customServings ?? [])
      .map((servingOption) => ({
        ...servingOption,
        name: servingOption.name.trim(),
        amount: Number(servingOption.amount),
        unit,
      }))
      .filter((servingOption) => servingOption.name && Number.isFinite(servingOption.amount) && servingOption.amount > 0),
  };
}

function normalizeServingUnit(unit?: string | null) {
  const normalized = unit?.trim().replace(/\s+/g, ' ').toLowerCase() ?? '';
  return normalized || null;
}

function formatServingValue(amount: number, unit?: string | null) {
  const normalizedUnit = normalizeServingUnit(unit);
  return `${formatAmount(amount)}${normalizedUnit ? ` ${normalizedUnit}` : ''}`;
}

function formatAmount(value: number) {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3))).replace(/\.?0+$/, '');
}
