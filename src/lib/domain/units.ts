import type { Form, Unit, BaseUnit } from './types';

const UNIT_TABLE: Record<Unit, { form: Form; factor: number }> = {
  piraso: { form: 'bilang', factor: 1 },
  dosena: { form: 'bilang', factor: 12 },
  kg: { form: 'timbang', factor: 1 },
  g: { form: 'timbang', factor: 0.001 },
  L: { form: 'sukat', factor: 1 },
  ml: { form: 'sukat', factor: 0.001 },
};

const BASE_UNIT: Record<Form, BaseUnit> = {
  bilang: 'piece',
  timbang: 'kg',
  sukat: 'liter',
};

const BASE_LABEL: Record<BaseUnit, string> = {
  piece: 'piraso',
  kg: 'kg',
  liter: 'L',
};

export function baseUnitFor(form: Form): BaseUnit {
  return BASE_UNIT[form];
}

export function unitsFor(form: Form): Unit[] {
  return (Object.keys(UNIT_TABLE) as Unit[]).filter((u) => UNIT_TABLE[u].form === form);
}

export function baseUnitLabel(baseUnit: BaseUnit): string {
  return BASE_LABEL[baseUnit];
}

export function unitFactor(unit: Unit): number {
  return UNIT_TABLE[unit].factor;
}

export function formForUnit(unit: Unit): Form {
  return UNIT_TABLE[unit].form;
}

export function pricePerBaseUnit(
  pricePaid: number | null,
  quantity: number | null,
  unit: Unit,
): number | null {
  if (pricePaid == null || quantity == null || quantity === 0) return null;
  return pricePaid / (quantity * unitFactor(unit));
}
