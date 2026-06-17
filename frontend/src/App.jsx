import { useCallback, useEffect, useState } from 'react'
import './App.css'

const defaultStatus = {
  state: 'idle',
  message: '尚未连接后端',
  payload: null,
}

function App() {
  const [status, setStatus] = useState(defaultStatus)
  const [echoText, setEchoText] = useState('你好，Flask')
  const [echoResult, setEchoResult] = useState(null)

  const checkHealth = useCallback(async () => {
    setStatus({ state: 'loading', message: '正在连接后端...', payload: null })

    try {
      const response = await fetch('/api/health')

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      setStatus({
        state: 'success',
        message: '后端连接正常',
        payload: data,
      })
    } catch (error) {
      setStatus({
        state: 'error',
        message: `无法连接后端：${error.message}`,
        payload: null,
      })
    }
  }, [])

  const sendEcho = async (event) => {
    event.preventDefault()
    setEchoResult({ state: 'loading', data: null })

    try {
      const response = await fetch('/api/echo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: echoText }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      setEchoResult({ state: 'success', data })
    } catch (error) {
      setEchoResult({
        state: 'error',
        data: { error: error.message },
      })
    }
  }

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  return (
    <main className="app-shell">
      <section className="status-panel" aria-labelledby="app-title">
        <div>
          <p className="eyebrow">React + Vite / Flask</p>
          <h1 id="app-title">前后端项目已就绪</h1>
          <p className="intro">
            这个前端通过 Vite 代理请求 Flask API，可以直接作为你的业务项目起点。
          </p>
        </div>

        <div className={`health health-${status.state}`}>
          <span className="health-dot" aria-hidden="true" />
          <div>
            <strong>{status.message}</strong>
            {status.payload ? (
              <span>
                {status.payload.service} / {status.payload.status}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="workspace-grid" aria-label="项目状态">
        <article className="project-card">
          <span className="project-label">Frontend</span>
          <h2>React + Vite</h2>
          <p>组件入口、样式、Vite 代理和构建脚本已经配置好。</p>
          <button type="button" onClick={checkHealth}>
            重新检测 API
          </button>
        </article>

        <article className="project-card">
          <span className="project-label">Backend</span>
          <h2>Flask API</h2>
          <p>默认运行在 127.0.0.1:5000，并提供健康检查与 echo 接口。</p>
          <form onSubmit={sendEcho} className="echo-form">
            <label htmlFor="echo-input">发送测试消息</label>
            <div className="echo-row">
              <input
                id="echo-input"
                value={echoText}
                onChange={(event) => setEchoText(event.target.value)}
                placeholder="输入一段消息"
              />
              <button type="submit">发送</button>
            </div>
          </form>
          {echoResult ? (
            <pre className={`echo-result echo-${echoResult.state}`}>
              {JSON.stringify(echoResult.data ?? { state: echoResult.state }, null, 2)}
            </pre>
          ) : null}
        </article>
      </section>
    </main>
  )
}

export default App
