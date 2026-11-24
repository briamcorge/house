/**
 * 全局弹窗滚动锁（2026-11-24）。
 *
 * 背景：弹窗只是盖了一层 fixed 遮罩，手指拖动时页面仍会跟着滚动。
 * 做法：监测 DOM 中是否存在弹窗层（.anim-overlay / .anim-overlay-fade，
 *       见 src/index.css 的过场动画约定），有就锁住 html/body 滚动，没有就解锁。
 * 说明：放在 main.tsx 安装一次即可，覆盖所有弹窗（含以后新增的，只要沿用类名）。
 */

const MODAL_SELECTOR = '.anim-overlay, .anim-overlay-fade'

let installed = false
let locked = false
let frame = 0
let prevBodyPaddingRight = ''

function applyLock(next: boolean): void {
  if (next === locked) return
  locked = next

  const html = document.documentElement
  const body = document.body

  if (next) {
    // 桌面端滚动条会随 overflow:hidden 消失，先补上等宽内边距避免页面横向跳动
    const scrollbarWidth = window.innerWidth - html.clientWidth
    if (scrollbarWidth > 0) {
      prevBodyPaddingRight = body.style.paddingRight
      body.style.paddingRight = `${scrollbarWidth}px`
    }
    html.classList.add('modal-open')
    body.classList.add('modal-open')
  } else {
    html.classList.remove('modal-open')
    body.classList.remove('modal-open')
    body.style.paddingRight = prevBodyPaddingRight
    prevBodyPaddingRight = ''
  }
}

function sync(): void {
  frame = 0
  applyLock(!!document.querySelector(MODAL_SELECTOR))
}

function scheduleSync(): void {
  if (frame) return
  frame = requestAnimationFrame(sync)
}

export function installModalScrollLock(): void {
  if (installed) return
  installed = true
  new MutationObserver(scheduleSync).observe(document.body, { childList: true, subtree: true })
  sync()
}
