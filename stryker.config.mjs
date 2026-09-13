/**
 * 变异测试配置（Stryker + Vitest）
 *
 * 用途：客观衡量"测试到底抓不抓得住错误"——自动把源码改坏（> 改 >=、删行、+ 改 - 等），
 * 跑测试看有没有变红。变了红 = 该变异被"杀死"；还是绿 = 测试有洞。
 * 变异得分 = 被杀死数 ÷ 总变异数。
 *
 * 只对核心文件开启（跑一次要几分钟，全项目开不现实）。
 * 用法：npx stryker run
 */
export default {
  // 只变异账单生成与 30/360 日期计算这个文件（房租金额的源头）
  mutate: ['src/utils/calculator.ts'],
  testRunner: 'vitest',
  reporters: ['clear-text', 'html', 'json'],
  // 按测试逐条分析覆盖率，能大幅减少每次变异需要重跑的用例数
  coverageAnalysis: 'perTest',
  concurrency: 4,
  htmlReporter: { fileName: 'coverage/mutation/index.html' },
  jsonReporter: { fileName: 'coverage/mutation/report.json' },
  thresholds: { high: 85, low: 70, break: null },
  timeoutMS: 20000,
}
