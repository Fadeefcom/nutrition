import {
  Barcode,
  Camera,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { BaseDropdown, type DropdownOption } from '../components/BaseDropdown';
import { EmptyState } from '../components/EmptyState';
import { ProgressRing } from '../components/ProgressRing';
import { Skeleton } from '../components/Skeleton';
import type { DailyNutrition, Product, Settings } from '../types/models';
import { entryFromProduct, macroTargets, normalizeNutrition, round } from '../utils/calculations';
import { addDays, formatShortDate, toIsoDate } from '../utils/date';

const now = () => new Date().toISOString();
const mealOptions: Array<DropdownOption<string>> = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];
const baseServingOptionId = 'base';

function blankProduct(seed = ''): Product {
  const trimmed = seed.trim();
  const barcode = isBarcodeLike(trimmed) ? trimmed : '';
  return {
    id: crypto.randomUUID(),
    name: barcode ? '' : trimmed,
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

export default function Nutrition() {
  const [date, setDate] = useState(toIsoDate());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [day, setDay] = useState<DailyNutrition | null>(null);
  const [mealType, setMealType] = useState('breakfast');
  const [productId, setProductId] = useState('');
  const [servingOptionId, setServingOptionId] = useState(baseServingOptionId);
  const [productQuery, setProductQuery] = useState('');
  const [productForm, setProductForm] = useState<Product>(() => blankProduct());
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [amountInput, setAmountInput] = useState('100');
  const [loading, setLoading] = useState(true);
  const [transitioningDate, setTransitioningDate] = useState(false);
  const [nutritionSaving, setNutritionSaving] = useState(false);
  const [productSaving, setProductSaving] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (day) {
        setTransitioningDate(true);
      } else {
        setLoading(true);
      }
      setError('');
      try {
        const [nextSettings, nextProducts, nextDay] = await Promise.all([
          api.settings(),
          api.products(),
          api.nutrition(date),
        ]);
        if (!active) return;

        setSettings(nextSettings);
        setProducts(nextProducts);
        setProductId('');
        setServingOptionId(baseServingOptionId);
        setAmountInput('100');
        setProductQuery('');
        setProductFormOpen(false);
        setDay(normalizeNutrition(nextDay));
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load nutrition.');
      } finally {
        if (!active) return;
        setLoading(false);
        setTransitioningDate(false);
      }
    };
    void load();

    return () => {
      active = false;
    };
  }, [date]);

  const targets = useMemo(() => (settings ? macroTargets(settings.nutritionTarget) : null), [settings]);
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [productId, products],
  );
  const selectedServing = useMemo(
    () =>
      selectedProduct?.customServings?.find((serving) => serving.id === servingOptionId) ?? null,
    [selectedProduct, servingOptionId],
  );
  const selectedServingUnit = selectedProduct
    ? selectedServing?.unit ?? getProductServing(selectedProduct).unit
    : 'g';
  const amount = parsePositiveAmount(amountInput);
  const productOptions = useMemo<Array<DropdownOption<string>>>(
    () =>
      products.map((product) => {
        const serving = getProductServing(product);
        return {
          value: product.id,
          label: productLabel(product),
          description: `${formatServingValue(serving.amount, serving.unit)} | ${formatAmount(
            caloriesForAmount(product, serving.amount),
          )} kcal`,
        };
      }),
    [products],
  );

  if (loading) {
    return <Skeleton className="h-[70vh]" />;
  }

  if (!settings || !day || !targets) {
    return <EmptyState title={error || 'Nutrition unavailable'} />;
  }

  const normalized = normalizeNutrition(day);
  const isToday = date === toIsoDate();

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost h-10 w-10 px-0"
            onClick={() => setDate((current) => addDays(current, -1))}
            type="button"
            title="Previous day"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xl font-black text-zinc-950 transition hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
            onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
            type="button"
          >
            <CalendarDays size={18} className="text-zinc-500 dark:text-zinc-400" />
            {isToday ? `Today, ${formatShortDate(date)}` : formatShortDate(date)}
          </button>
          <input
            ref={dateInputRef}
            className="sr-only"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <button
            className="btn btn-ghost h-10 w-10 px-0"
            onClick={() => setDate((current) => addDays(current, 1))}
            type="button"
            title="Next day"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {nutritionSaving ? (
          <p className="text-sm font-bold text-lagoon">Saving...</p>
        ) : null}
        {error ? <p className="text-sm font-semibold text-ember">{error}</p> : null}
      </section>

      <motion.div
        key={day.date}
        className="space-y-5"
        initial={{ opacity: 0.92, y: 6 }}
        animate={{ opacity: transitioningDate ? 0.58 : 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      >
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
          <BaseDropdown
            options={mealOptions}
            value={mealType}
            onChange={(nextMealType) => setMealType(nextMealType)}
            placeholder="Meal"
          />

          <div className="flex min-w-0 gap-2">
            <BaseDropdown
              className="flex-1"
              options={productOptions}
              value={productId}
              onChange={(nextProductId) => {
                const product = products.find((item) => item.id === nextProductId);
                if (!product) return;

                setProductId(product.id);
                setServingOptionId(baseServingOptionId);
                setAmountInput(formatAmount(getProductServing(product).amount));
                setProductQuery(productLabel(product));
                setProductFormOpen(false);
              }}
              placeholder="Search product, type barcode, or create new"
              searchable
              searchPlaceholder="Search products"
              emptyLabel="No options found"
              footer={({ searchQuery, close }) => {
                const query = searchQuery.trim();
                return isBarcodeLike(query) ? (
                  <button
                    className="btn btn-ghost h-9 w-full justify-start"
                    disabled={barcodeLoading}
                    onClick={() => {
                      close();
                      setProductQuery(query);
                      lookupBarcode(query);
                    }}
                    type="button"
                  >
                    <Barcode size={15} />
                    Lookup barcode {query}
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost h-9 w-full justify-start"
                    disabled={!query}
                    onClick={() => {
                      close();
                      setProductQuery(query);
                      openProductDraft(query);
                    }}
                    type="button"
                  >
                    <Plus size={15} />
                    {query ? `Create "${query}"` : 'Type to create product'}
                  </button>
                );
              }}
            />
            <button
              className="btn btn-ghost h-10 w-10 shrink-0 px-0"
              onClick={() => fileInputRef.current?.click()}
              title="Photo AI draft"
              type="button"
            >
              <Camera size={15} />
            </button>
          </div>

          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              openCameraDraft(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />

          <QuantityControlGroup
            product={selectedProduct}
            servingOptionId={servingOptionId}
            amountInput={amountInput}
            onAmountInputChange={setAmountInput}
            onServingOptionChange={(nextServingOptionId) => {
              if (!selectedProduct) return;
              const nextServing = getServingSelection(selectedProduct, nextServingOptionId);
              setServingOptionId(nextServingOptionId);
              setAmountInput(formatAmount(nextServingOptionId === baseServingOptionId ? nextServing.amount : 1));
            }}
          />

          <button
            className="btn btn-primary"
            onClick={addEntry}
            disabled={!selectedProduct || !amount || nutritionSaving}
          >
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
                  <p className="text-xs uppercase text-zinc-500 dark:text-zinc-400">
                    {[entry.mealType, entry.servingLabel].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Metric label={entry.amountUnit || 'g'} value={entry.displayAmount ?? entry.grams} />
                <Metric label="kcal" value={entry.calories} />
                <Metric label="P" value={entry.protein} />
                <Metric label="C/F" value={`${entry.carbs}/${entry.fat}`} />
                <button
                  className="btn btn-ghost h-11 w-11 px-0"
                  disabled={nutritionSaving}
                  onClick={() => removeEntry(entry.id)}
                  title="Delete entry"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      </motion.div>
    </div>
  );

  async function addEntry() {
    const parsedAmount = parsePositiveAmount(amountInput);
    if (!selectedProduct || !day || !parsedAmount) return;
    const serving = getServingSelection(selectedProduct, servingOptionId);
    const canonicalAmount =
      servingOptionId === baseServingOptionId ? parsedAmount : parsedAmount * serving.amount;
    const selectedServingName = selectedServing?.name ?? null;
    const nextDay = normalizeNutrition({
      ...day,
      entries: [
        ...day.entries,
        entryFromProduct(
          selectedProduct,
          canonicalAmount,
          mealType,
          parsedAmount,
          selectedServingName ?? normalizeServingUnit(selectedServingUnit),
          selectedServingName,
        ),
      ],
    });

    await saveNutritionMutation(nextDay, day);
  }

  async function removeEntry(id: string) {
    if (!day) return;
    const nextDay = normalizeNutrition({
      ...day,
      entries: day.entries.filter((entry) => entry.id !== id),
    });

    await saveNutritionMutation(nextDay, day);
  }

  async function saveNutritionMutation(nextDay: DailyNutrition, previousDay: DailyNutrition) {
    setDay(nextDay);
    setNutritionSaving(true);
    setError('');
    try {
      const saved = await api.saveNutrition(date, nextDay);
      setDay(normalizeNutrition(saved));
    } catch (err) {
      setDay(previousDay);
      setError(err instanceof Error ? err.message : 'Unable to save nutrition.');
    } finally {
      setNutritionSaving(false);
    }
  }

  function openProductDraft(seed: string, patch: Partial<Product> = {}) {
    setProductId('');
    setServingOptionId(baseServingOptionId);
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
      setServingOptionId(baseServingOptionId);
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
    const serving = getProductServing(productForm);
    const product = {
      ...productForm,
      name: productForm.name.trim(),
      brand: productForm.brand.trim(),
      barcode: productForm.barcode.trim(),
      servingSizeGrams: serving.amount,
      servingSizeAmount: serving.amount,
      servingSizeUnit: serving.unit,
      customServings: productForm.customServings ?? [],
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
      setServingOptionId(baseServingOptionId);
      setAmountInput(formatAmount(getProductServing(saved).amount));
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
  const submitProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave();
  };

  return (
    <form
      className="mt-4 rounded-lg border border-black/10 bg-black/5 p-3 dark:border-white/10 dark:bg-white/10"
      onSubmit={submitProduct}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">{exists ? 'Review product' : 'Create product'}</h3>
          <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{product.source}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary h-9" disabled={saving} type="submit">
            <Save size={15} />
            {saving ? 'Saving' : 'Save product'}
          </button>
          <button className="btn btn-ghost h-9 w-9 px-0" onClick={onClose} title="Close" type="button">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <TextField label="Name" value={product.name} onChange={(name) => onChange({ ...product, name })} />
        <TextField label="Brand" value={product.brand} onChange={(brand) => onChange({ ...product, brand })} />
        <TextField label="Barcode" value={product.barcode} onChange={(barcode) => onChange({ ...product, barcode })} />
        <AdaptiveServingField
          product={product}
          onChange={onChange}
        />
        <NumberField
          label="Calories"
          value={product.caloriesPer100g}
          onChange={(caloriesPer100g) => onChange({ ...product, caloriesPer100g })}
        />
        <NumberField
          label="Protein"
          value={product.proteinPer100g}
          onChange={(proteinPer100g) => onChange({ ...product, proteinPer100g })}
        />
        <NumberField
          label="Carbs"
          value={product.carbsPer100g}
          onChange={(carbsPer100g) => onChange({ ...product, carbsPer100g })}
        />
        <NumberField
          label="Fat"
          value={product.fatPer100g}
          onChange={(fatPer100g) => onChange({ ...product, fatPer100g })}
        />
        <NumberField
          label="Fiber"
          value={product.fiberPer100g}
          onChange={(fiberPer100g) => onChange({ ...product, fiberPer100g })}
        />
      </div>
    </form>
  );
}

function AdaptiveServingField({
  product,
  onChange,
}: {
  product: Product;
  onChange: (product: Product) => void;
}) {
  const parsedServing = getProductServing(product);
  const [draft, setDraft] = useState(() => formatServingValue(parsedServing.amount, parsedServing.unit));
  const [error, setError] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customAmount, setCustomAmount] = useState('');

  useEffect(() => {
    setDraft(formatServingValue(parsedServing.amount, parsedServing.unit));
    setError('');
  }, [parsedServing.amount, parsedServing.unit]);

  const commitServing = () => {
    const parsed = parseServingValue(draft);
    if (!parsed) {
      setError('Enter an amount like 100 g, 250 ml, or 1 scoop.');
      return;
    }

    setError('');
    setDraft(formatServingValue(parsed.amount, parsed.unit));
    onChange({
      ...product,
      servingSizeGrams: parsed.amount,
      servingSizeAmount: parsed.amount,
      servingSizeUnit: parsed.unit,
    });
  };

  const saveCustomServing = () => {
    const parsedAmount = parsePositiveAmount(customAmount);
    if (!customName.trim() || parsedAmount === null) {
      return;
    }

    onChange({
      ...product,
      customServings: [
        ...(product.customServings ?? []),
        {
          id: crypto.randomUUID(),
          name: customName.trim(),
          amount: parsedAmount,
          unit: parsedServing.unit,
        },
      ],
    });
    setCustomName('');
    setCustomAmount('');
    setCustomOpen(false);
  };

  const customPreviewAmount = parsePositiveAmount(customAmount);
  const customPreviewValue =
    customPreviewAmount === null ? customAmount.trim() || '0' : formatAmount(customPreviewAmount);
  const normalizedCustomName = customName.trim() || 'Serving';

  return (
    <div className="text-sm font-bold">
      <label>
        <span className="mb-1 block text-zinc-500 dark:text-zinc-400">Serving size</span>
        <input
          className={`field w-full ${error ? 'border-ember focus:border-ember focus:ring-ember/30' : ''}`}
          value={draft}
          onChange={(event) => {
            const nextDraft = event.target.value;
            const parsed = parseServingValue(nextDraft);
            setDraft(nextDraft);
            setError('');
            if (parsed) {
              onChange({
                ...product,
                servingSizeGrams: parsed.amount,
                servingSizeAmount: parsed.amount,
                servingSizeUnit: parsed.unit,
              });
            }
          }}
          onBlur={commitServing}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitServing();
            }
          }}
          placeholder="100 g"
        />
      </label>
      {error ? <p className="mt-1 text-xs font-semibold text-ember">{error}</p> : null}

      {!customOpen ? (
        <button
          className="mt-2 text-xs font-black text-mint transition hover:text-mint/80"
          onClick={() => setCustomOpen(true)}
          type="button"
        >
          + Add custom serving
        </button>
      ) : (
        <div className="mt-2 rounded-lg border border-black/10 bg-black/5 p-3 dark:border-white/10 dark:bg-black/15">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <label>
              <span className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Serving name</span>
              <input
                className="field min-h-10 w-full"
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="Scoop"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Equivalent amount</span>
              <input
                className="field min-h-10 w-full"
                inputMode="decimal"
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
                placeholder="30"
              />
            </label>
          </div>
          <p className="mt-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
            1 {normalizedCustomName} = {customPreviewValue}{formatUnitSuffix(parsedServing.unit)}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              className="btn btn-primary h-9"
              disabled={!customName.trim() || customPreviewAmount === null}
              onClick={saveCustomServing}
              type="button"
            >
              Save
            </button>
            <button
              className="btn btn-ghost h-9"
              onClick={() => {
                setCustomOpen(false);
                setCustomName('');
                setCustomAmount('');
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {(product.customServings ?? []).length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(product.customServings ?? []).map((serving) => (
            <span
              key={serving.id}
              className="rounded-md bg-black/5 px-2 py-1 text-xs font-bold text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
            >
              1 {serving.name} = {formatServingValue(serving.amount, serving.unit)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function QuantityControlGroup({
  product,
  servingOptionId,
  amountInput,
  onAmountInputChange,
  onServingOptionChange,
}: {
  product: Product | null;
  servingOptionId: string;
  amountInput: string;
  onAmountInputChange: (value: string) => void;
  onServingOptionChange: (servingOptionId: string) => void;
}) {
  const servingOptions = useMemo<Array<DropdownOption<string>>>(() => {
    if (!product) return [];

    const baseServing = getProductServing(product);
    const baseUnit = normalizeServingUnit(baseServing.unit) ?? 'unit';
    return [
      {
        value: baseServingOptionId,
        label: baseUnit,
        description: `Base Unit · ${formatServingValue(baseServing.amount, baseServing.unit)}`,
      },
      ...(product.customServings ?? []).map((serving) => ({
        value: serving.id,
        label: serving.name,
        description: `1 ${serving.name} = ${formatServingValue(serving.amount, serving.unit)}`,
      })),
    ];
  }, [product]);

  return (
    <div className="flex min-w-0">
      <label className="min-w-0 flex-1">
        <span className="sr-only">Amount</span>
        <input
          className="field no-spinner h-10 min-h-10 w-full rounded-r-none border-r-0 text-right"
          type="number"
          min="0.001"
          step="any"
          value={amountInput}
          disabled={!product}
          onChange={(event) => {
            if (isPositiveAmountDraft(event.target.value)) {
              onAmountInputChange(event.target.value);
            }
          }}
          onBlur={() => {
            const parsedAmount = parsePositiveAmount(amountInput);
            onAmountInputChange(parsedAmount ? formatAmount(parsedAmount) : '1');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              const parsedAmount = parsePositiveAmount(amountInput);
              onAmountInputChange(parsedAmount ? formatAmount(parsedAmount) : '1');
            }
          }}
          placeholder="100"
        />
      </label>
      <BaseDropdown
        className="w-24 shrink-0"
        triggerClassName="h-10 min-h-10 rounded-l-none border-l-0 bg-[#262626] px-2 text-xs hover:bg-[#303030]"
        menuClassName="min-w-36"
        options={servingOptions}
        value={product ? servingOptionId : ''}
        onChange={(nextServingOptionId) => onServingOptionChange(nextServingOptionId)}
        placeholder="unit"
        disabled={!product}
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

type ParsedServing = {
  amount: number;
  unit: string | null;
};

function getProductServing(product: Product): ParsedServing {
  const hasAdaptiveServing =
    typeof product.servingSizeAmount === 'number' && Number.isFinite(product.servingSizeAmount);
  const unit = normalizeServingUnit(product.servingSizeUnit);
  const amount = hasAdaptiveServing
    ? product.servingSizeAmount
    : product.servingSizeGrams;

  return {
    amount,
    unit: unit ?? 'g',
  };
}

function getServingSelection(product: Product, servingOptionId: string): ParsedServing {
  if (servingOptionId !== baseServingOptionId) {
    const customServing = product.customServings?.find((serving) => serving.id === servingOptionId);
    if (customServing) {
      return {
        amount: customServing.amount,
        unit: normalizeServingUnit(customServing.unit),
      };
    }
  }

  return getProductServing(product);
}

function parseServingValue(value: string): ParsedServing | null {
  const match = value.trim().match(/^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*([^\d\s].*)?$/);
  if (!match) return null;

  const amount = parsePositiveAmount(match[1]);
  if (amount === null) return null;

  return {
    amount,
    unit: normalizeServingUnit(match[2] ?? null),
  };
}

function isPositiveAmountDraft(value: string) {
  return /^(?:\d+(?:[.,]\d*)?|[.,]\d*)?$/.test(value.trim());
}

function parsePositiveAmount(value: string) {
  const amount = parseAmountValue(value);
  return amount !== null && amount > 0 ? amount : null;
}

function parseAmountValue(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function normalizeServingUnit(unit?: string | null) {
  const normalized = unit?.trim().replace(/\s+/g, ' ').toLowerCase() ?? '';
  return normalized || null;
}

function formatServingValue(amount: number, unit?: string | null) {
  return `${formatAmount(amount)}${formatUnitSuffix(unit)}`;
}

function formatUnitSuffix(unit?: string | null) {
  const normalized = normalizeServingUnit(unit);
  return normalized ? ` ${normalized}` : '';
}

function formatAmount(value: number) {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3))).replace(/\.?0+$/, '');
}

function caloriesForAmount(product: Product, amount: number) {
  const serving = getProductServing(product);
  return serving.amount > 0 ? round(product.caloriesPer100g * (amount / serving.amount)) : 0;
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
