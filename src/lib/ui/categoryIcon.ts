import { Beef, Carrot, Soup, Wheat, ShoppingBasket } from 'lucide-svelte';
import type { Category } from '../domain/types';

export function categoryIcon(c: Category) {
  switch (c) {
    case 'karne': return Beef;
    case 'gulay': return Carrot;
    case 'condiments': return Soup;
    case 'bigas': return Wheat;
    default: return ShoppingBasket;
  }
}
