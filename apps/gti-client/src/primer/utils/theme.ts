// Utility functions used in theme-preval.js
// This file needs to be a JavaScript file using CommonJS to be compatible with preval

import { isEmpty, isObject } from "lodash";

export function fontStack(fonts: string[]) {
  return fonts
    .map((font) => (font.includes(" ") ? `"${font}"` : font))
    .join(", ");
}

// The following functions are a temporary measure for splitting shadow values out from the colors object.
// Eventually, we will push these structural changes upstream to primer/primitives so this data manipulation
// will not be needed.

function isShadowValue(value: string) {
  return (
    typeof value === "string" &&
    /(inset\s|)([0-9.]+(\w*)\s){1,4}(rgb[a]?\(.*\)|\w+)/.test(value)
  );
}

function isColorValue(value: string) {
  if (isShadowValue(value)) return false;
  if (value.startsWith("#")) return true; // #hex
  if (value.startsWith("rgb")) return true; // rgb, rgba
  if (value.startsWith("hsl")) return true; // hsl, hsla
  return false;
}

type R = { [key: string]: R } | string | string[];

function filterObject(obj: R, predicate: (value: string) => boolean) {
  if (Array.isArray(obj)) {
    return obj.filter(predicate);
  }

  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (isObject(value)) {
      const result = filterObject(value, predicate);

      // Don't include empty objects or arrays
      if (!isEmpty(result)) {
        acc[key] = result;
      }
    } else if (predicate(value)) {
      acc[key] = value;
    }

    return acc;
  }, {} as Record<string | number | symbol, unknown>);
}

export function partitionColors(colors: R) {
  return {
    colors: filterObject(colors, (value) => isColorValue(value)),
    shadows: filterObject(colors, (value) => isShadowValue(value)),
  };
}

export function omitScale(
  obj: ({ scale?: never } & string[]) | { scale?: unknown }
) {
  const { scale, ...rest } = obj;
  void scale;
  return rest;
}
