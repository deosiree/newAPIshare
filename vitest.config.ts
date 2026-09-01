import { defineConfig } from 'vitest/config'

/** Vitest 单元/集成测试配置，明确排除由 Playwright 执行的浏览器验收用例。 */
export default defineConfig({
  test: {
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
  },
})
