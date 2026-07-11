/**
 * 测试 mock 统一入口。
 *
 * 业务测试按需 import：
 *   import { featureGateMock, logMock } from '../../../tests/mocks'
 *
 * 避免测试文件内联 mock 定义（CLAUDE.md §Testing 规范）。
 */
export { featureGateMock, type FeatureGateMock } from './feature-gate.js'
export { logMock } from './log.js'
// 后续添加：debugMock, axiosMock 等
