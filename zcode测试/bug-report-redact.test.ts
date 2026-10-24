import { describe, it, expect } from 'vitest'
import { redactDeep, redactText } from '../src/lib/bug-report/redact'
import { normalizeRoute } from '../src/lib/bug-report/route'

describe('bug report 脱敏', () => {
  it('邮箱/手机/身份证/JWT/session/Bearer/URL query 都被替换', () => {
    const raw = [
      '联系 test.user+tag@example.com',
      '电话 13800138000',
      '身份证 110101199001011234',
      'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
      '会话 sb-abcdefghijklmnop',
      'Authorization: Bearer abc.def.ghi',
      'https://example.com/path?token=secret#frag',
    ].join(' | ')

    const result = redactText(raw, 5000)
    expect(result).not.toContain('test.user+tag@example.com')
    expect(result).not.toContain('13800138000')
    expect(result).not.toContain('110101199001011234')
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(result).not.toContain('sb-abcdefghijklmnop')
    expect(result).not.toContain('abc.def.ghi')
    expect(result).not.toContain('token=secret')
    expect(result).toContain('[email]')
    expect(result).toContain('[phone]')
    expect(result).toContain('[id]')
    expect(result).toContain('[jwt]')
    expect(result).toContain('[session]')
    expect(result).toContain('https://example.com/path')
  })

  it('中文标签后的姓名/信息做启发式隐藏', () => {
    expect(redactText('租客：张三，电话 13800138000')).toContain('租客：[已隐去]')
    expect(redactText('姓名: 李四')).toContain('姓名：[已隐去]')
  })

  it('超长文本被截断并标记', () => {
    const result = redactText('a'.repeat(100), 20)
    expect(result.startsWith('a'.repeat(20))).toBe(true)
    expect(result).toContain('…[truncated]')
  })

  it('redactDeep 会递归处理嵌套对象和数组', () => {
    const result = redactDeep({
      email: 'a@b.com',
      nested: { phone: '13800138000' },
      list: ['13800138000', 'ok'],
    }) as any
    expect(result.email).toBe('[email]')
    expect(result.nested.phone).toBe('[phone]')
    expect(result.list[0]).toBe('[phone]')
    expect(result.list[1]).toBe('ok')
  })
})

describe('normalizeRoute', () => {
  it('去掉 query/hash，并把 UUID/长数字归一化为 :id', () => {
    expect(normalizeRoute('#/properties/123e4567-e89b-12d3-a456-426614174000?token=x'))
      .toBe('/properties/:id')
    expect(normalizeRoute('/rooms/12345?x=1')).toBe('/rooms/:id')
    expect(normalizeRoute('#/bills')).toBe('/bills')
  })

  it('空值回退到 /', () => {
    expect(normalizeRoute('')).toBe('/')
    expect(normalizeRoute(undefined)).toBe('/')
  })
})
