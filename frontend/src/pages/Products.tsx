import { Barcode, Save, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import type { Product } from '../types/models';

const now = () => new Date().toISOString();

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

  const save = async () => {
    if (!form.name.trim()) {
      setError('Product name is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const exists = products.some((product) => product.id === form.id);
      const saved = exists ? await api.updateProduct(form) : await api.createProduct(form);
      setProducts((items) => (exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [...items, saved]));
      setForm(blankProduct());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setSaving(false);
    }
  };

  const searchBarcode = async () => {
    if (!barcode.trim()) return;
    setError('');
    try {
      const product = await api.barcode(barcode.trim());
      setForm({
        ...product,
        id: products.some((item) => item.id === product.id) ? product.id : product.id || crypto.randomUUID(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Barcode lookup failed.');
      setForm(blankProduct(barcode.trim()));
    }
  };

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

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            className="field"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            placeholder="Barcode"
          />
          <button className="btn btn-primary" onClick={searchBarcode}>
            <Barcode size={17} />
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
                  <p className="text-sm font-black">{product.caloriesPer100g} kcal</p>
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
          <Input label="Barcode" value={form.barcode} onChange={(value) => setForm({ ...form, barcode: value })} />
          <NumberInput
            label="Serving size"
            value={form.servingSizeGrams}
            onChange={(servingSizeGrams) =>
              setForm({
                ...form,
                servingSizeGrams,
                servingSizeAmount: servingSizeGrams,
                servingSizeUnit: 'g',
              })
            }
          />
          <NumberInput
            label="Calories"
            value={form.caloriesPer100g}
            onChange={(caloriesPer100g) => setForm({ ...form, caloriesPer100g })}
          />
          <NumberInput
            label="Protein"
            value={form.proteinPer100g}
            onChange={(proteinPer100g) => setForm({ ...form, proteinPer100g })}
          />
          <NumberInput
            label="Carbs"
            value={form.carbsPer100g}
            onChange={(carbsPer100g) => setForm({ ...form, carbsPer100g })}
          />
          <NumberInput
            label="Fat"
            value={form.fatPer100g}
            onChange={(fatPer100g) => setForm({ ...form, fatPer100g })}
          />
          <NumberInput
            label="Fiber"
            value={form.fiberPer100g}
            onChange={(fiberPer100g) => setForm({ ...form, fiberPer100g })}
          />
        </div>
        <textarea
          className="field mt-3 min-h-24 w-full py-3"
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          placeholder="Notes"
        />
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

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-bold">
      <span className="mb-1 block text-zinc-500 dark:text-zinc-400">{label}</span>
      <input className="field w-full" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
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
