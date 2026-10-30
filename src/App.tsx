import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { configError } from '@/lib/env'
import { Layout } from '@/components/Layout'
import Home from '@/pages/Home'
import CreateJob from '@/pages/CreateJob'
import JobPage from '@/pages/JobPage'
import MyJobs from '@/pages/MyJobs'

// Loaded on demand: it bundles the compiled contract bytecode.
const Deploy = lazy(() => import('@/pages/Deploy'))

export default function App() {
  if (configError) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="display text-xl font-bold text-ink">PayOnProof is not configured</h1>
        <p className="mt-2 text-sm text-danger">{configError}</p>
        <p className="mt-2 text-sm text-muted">Set VITE_CHAIN, VITE_JOBS_ADDRESS and VITE_JOBS_DEPLOY_BLOCK in .env and restart the dev server.</p>
      </main>
    )
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="create" element={<CreateJob />} />
          <Route path="job/:id" element={<JobPage />} />
          <Route path="my-jobs" element={<MyJobs />} />
          <Route
            path="deploy"
            element={
              <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
                <Deploy />
              </Suspense>
            }
          />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
