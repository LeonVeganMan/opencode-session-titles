import { expect, test } from "bun:test"
import { DEFAULTS, cleanTitle, due, parseConfig } from "./title"

test("missing or broken config falls back to the defaults", () => {
  expect(parseConfig(null)).toEqual(DEFAULTS)
  expect(parseConfig({ every: 0, maxLength: -3 })).toEqual(DEFAULTS)
})

test("a partial config keeps the other defaults", () => {
  expect(parseConfig({ every: 4 })).toEqual({ ...DEFAULTS, every: 4 })
})

test("the title language defaults to English and can be changed", () => {
  expect(parseConfig({}).language).toBe("en")
  expect(parseConfig({ language: "it" }).language).toBe("it")
  expect(parseConfig({ language: "  " }).language).toBe("en")
})

test("the first reply renames only when first is on", () => {
  expect(due(1, DEFAULTS)).toBe(true)
  expect(due(1, { ...DEFAULTS, first: false })).toBe(false)
})

test("later renames land on every N replies", () => {
  expect(due(9, DEFAULTS)).toBe(false)
  expect(due(10, DEFAULTS)).toBe(true)
  expect(due(20, { ...DEFAULTS, first: false })).toBe(true)
  expect(due(0, DEFAULTS)).toBe(false)
})

test("the title is cleaned and capped", () => {
  expect(cleanTitle('Title: "Fixing the footer slot."', 40)).toBe("Fixing the footer slot")
  expect(cleanTitle("  a   very   long   title   that   overflows  ", 10)).toBe("a very lon")
  expect(cleanTitle('""', 40)).toBe("")
})
