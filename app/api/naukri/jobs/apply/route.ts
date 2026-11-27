/**
 * POST /api/naukri/jobs/apply
 * Triggers the auto-apply engine for authenticated user
 *
 * GET /api/naukri/jobs/apply
 * Returns apply queue + history
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { runAutoApplyEngine } from '@/lib/auto-apply-engine'

export async function POST() {
  const session = await getServerSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, naukri_user_id, naukri_token, base_resume_text, auto_apply_enabled, preferences, naukri_cv_id')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!user.naukri_user_id) return NextResponse.json({ error: 'Naukri not connected' }, { status: 400 })
  if (!user.base_resume_text) return NextResponse.json({ error: 'No resume uploaded' }, { status: 400 })
  if (!user.naukri_cv_id) return NextResponse.json({ error: 'CV ID not found — reconnect Naukri' }, { status: 400 })

  // Check if engine already running (last sync < 5 mins ago)
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: runningSync } = await supabaseAdmin
    .from('sync_logs')
    .select('id, started_at')
    .eq('user_id', user.id)
    .eq('status', 'running')
    .gte('started_at', fiveMinsAgo)
    .single()

  if (runningSync) {
    return NextResponse.json({ error: 'Engine already running. Please wait.' }, { status: 429 })
  }

  // Run engine (async — returns result when done)
  try {
    const result = await runAutoApplyEngine(user.id)
    return NextResponse.json({ success: true, result })
  } catch (err) {
    console.error('[AutoApply] Engine error:', err)
    return NextResponse.json({
      error: 'Engine failed',
      details: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 20
  const offset = (page - 1) * limit
  const statusFilter = searchParams.get('status')

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Queue
  let queueQuery = supabaseAdmin
    .from('apply_queue')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (statusFilter) queueQuery = queueQuery.eq('status', statusFilter)

  const { data: queue, count: queueTotal } = await queueQuery

  // Recent history
  const { data: history } = await supabaseAdmin
    .from('apply_history')
    .select('*')
    .eq('user_id', user.id)
    .order('applied_at', { ascending: false })
    .limit(10)

  // Stats breakdown
  let stats = null
  try {
    const { data: rpcData } = await supabaseAdmin.rpc('get_apply_stats', { user_uuid: user.id })
    stats = rpcData
  } catch {
    stats = null
  }

  // Fallback stats if RPC not available
  const statusCounts: Record<string, number> = {}
  if (!stats) {
    for (const status of ['pending', 'done', 'failed', 'skipped', 'applying', 'tailoring']) {
      const { count } = await supabaseAdmin
        .from('apply_queue')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', status)
      statusCounts[status] = count || 0
    }
  }

  return NextResponse.json({
    queue: queue || [],
    history: history || [],
    total: queueTotal || 0,
    page,
    statusBreakdown: stats || statusCounts,
  })
}
