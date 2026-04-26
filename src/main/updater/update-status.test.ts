import assert from "node:assert/strict"
import test from "node:test"
import { createUpdateStatus, isUpdaterSupported, normalizeVersion } from "./update-status.ts"

test("isUpdaterSupported requires a packaged Windows or macOS build", () => {
  assert.equal(isUpdaterSupported("win32", true), true)
  assert.equal(isUpdaterSupported("darwin", true), true)
  assert.equal(isUpdaterSupported("linux", true), false)
  assert.equal(isUpdaterSupported("win32", false), false)
})

test("normalizeVersion trims a leading v from release tags", () => {
  assert.equal(normalizeVersion("v1.2.3"), "1.2.3")
  assert.equal(normalizeVersion("  V2.0.0  "), "2.0.0")
  assert.equal(normalizeVersion("1.0.0"), "1.0.0")
  assert.equal(normalizeVersion("   "), null)
})

test("createUpdateStatus fills unset metadata with null", () => {
  assert.deepEqual(createUpdateStatus("0.1.2", "available"), {
    phase: "available",
    currentVersion: "0.1.2",
    availableVersion: null,
    progressPercent: null,
    message: null,
  })
})
