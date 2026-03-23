"use client"
import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  Drawer, Button, Checkbox, Avatar, Empty, DatePicker,
  Upload, message, Modal, Space, Row, Col, Input,
  Collapse, Alert, Progress, Spin, Badge, Tag
} from 'antd'
import {
  CloseOutlined, UserOutlined, DeleteOutlined, UploadOutlined,
  CheckCircleOutlined, CalendarOutlined, FileTextOutlined,
  TeamOutlined, FlagOutlined, ArrowRightOutlined, ArrowLeftOutlined,
  SaveOutlined, EyeOutlined, WarningOutlined, HeartFilled,
  ApartmentOutlined, SearchOutlined, ReloadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../../../../../lib/firbase-client'
import { paymentApi } from '@/utils/api'
import { Colors } from '@/constent/antdTheme'
import {
  fetchAllMembersForSearch,
  fetchMembersPaginated,
} from '@/app/members/components/firebase-helpers'

const { confirm } = Modal
const { Panel }   = Collapse
const C    = Colors
const grad = `linear-gradient(135deg,${C.primary} 0%,${C.secondary} 100%)`
const gradG = `linear-gradient(135deg,${C.success} 0%,${C.accent} 100%)`

// ─── tiny helpers ─────────────────────────────────────────────────────────────
const Pill = ({ children, color = C.primary }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', padding: '1px 7px',
    borderRadius: 999, fontSize: 10, fontWeight: 600,
    background: color + '18', color, lineHeight: '18px',
  }}>{children}</span>
)
const Label = ({ children, required }) => (
  <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, marginBottom: 4 }}>
    {children}{required && <span style={{ color: C.error }}> *</span>}
  </div>
)

// ─── step bar ─────────────────────────────────────────────────────────────────
const StepBar = ({ step }) => {
  const steps = ['Program', 'Groups', 'Members', 'Details']
  return (
    <div style={{
      display: 'flex', alignItems: 'center', background: C.surfaceSec,
      borderRadius: 10, padding: '10px 18px', marginBottom: 20, border: `1px solid ${C.border}`
    }}>
      {steps.map((label, i) => {
        const active = i === step, done = i < step
        return (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0,
                background: done ? gradG : active ? grad : C.border, color: done || active ? '#fff' : C.muted
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: 12, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                color: active ? C.primary : done ? C.accent : C.muted
              }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: '0 8px', minWidth: 16,
                background: done ? C.accent : C.border, borderRadius: 2
              }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

const SectionHeader = ({ icon, title, subtitle, action }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9, background: grad, display: 'flex',
        alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, flexShrink: 0
      }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.fg }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: C.muted }}>{subtitle}</div>}
      </div>
    </div>
    {action}
  </div>
)

// ─── member select card ───────────────────────────────────────────────────────
// Uses flat programId field — member.programId === programId
const MemberSelectCard = ({ member, checked, onChange, programId }) => {
  const alreadyClosed = (member.closedStatus || []).some(
    cs => cs.programId === programId && cs.closingGroupId
  )
  return (
    <div
      onClick={() => !alreadyClosed && onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 8,
        cursor: alreadyClosed ? 'not-allowed' : 'pointer',
        border: `1.5px solid ${alreadyClosed ? C.warning : checked ? C.primary : C.border}`,
        background: alreadyClosed ? C.warning + '08' : checked ? C.primary + '08' : C.surface,
        transition: 'all .15s', marginBottom: 6,
      }}
    >
      <Checkbox
        checked={checked} disabled={alreadyClosed}
        onChange={e => { e.stopPropagation(); !alreadyClosed && onChange(e.target.checked) }}
        onClick={e => e.stopPropagation()}
      />
      <Avatar src={member.photoURL} icon={<UserOutlined />} size={34}
        style={{ border: `2px solid ${alreadyClosed ? C.warning : checked ? C.primary : C.border}`, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {member.displayName || member.name}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
          <Pill color={C.info}>{member.registrationNumber}</Pill>
          {member.phone   && <Pill color={C.accent}>{member.phone}</Pill>}
          {member.village && <Pill color={C.muted}>{member.village}</Pill>}
          {/* Show program name from flat field */}
          {member.programName && <Pill color={C.primary}>{member.programName}</Pill>}
          {alreadyClosed && <Pill color={C.warning}>Already Closed</Pill>}
        </div>
      </div>
      {checked && !alreadyClosed && <CheckCircleOutlined style={{ color: C.primary, fontSize: 16, flexShrink: 0 }} />}
    </div>
  )
}

// ─── member detail row (step 3) ───────────────────────────────────────────────
const MemberDetailRow = ({ member, details, progress, onUpdate, onRemove, onUpload, onRemoveFile }) => {
  const pct      = progress
  const uploading = typeof pct === 'number' && pct > 0 && pct < 100
  const uploaded  = pct === 'done' || !!details?.invitationUrl
  const errored   = pct === 'error'
  return (
    <div style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', background: C.surfaceSec, borderBottom: `1px solid ${C.border}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar src={member?.photoURL} icon={<UserOutlined />} size={38}
            style={{ border: `2px solid ${C.primaryL}`, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.fg }}>{member?.displayName || member?.name}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
              <Pill color={C.info}>{member?.registrationNumber}</Pill>
              {member?.phone && <Pill color={C.accent}>{member.phone}</Pill>}
            </div>
          </div>
        </div>
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={onRemove} style={{ color: C.error }}>Remove</Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', gap: 14, padding: '12px 14px', alignItems: 'start' }}>
        <div>
          <Label required>Marriage Date</Label>
          <DatePicker style={{ width: '100%' }} value={details?.marriageDate}
            onChange={d => onUpdate('marriageDate', d)}
            format="DD/MM/YYYY" placeholder="Pick date" size="small" allowClear={false} />
        </div>
        <div>
          <Label>Invitation Card</Label>
          {uploaded && !uploading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.success + '10', border: `1px solid ${C.success}35`, borderRadius: 7, padding: '5px 10px' }}>
              <CheckCircleOutlined style={{ color: C.success, fontSize: 13 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.success, flex: 1 }}>Uploaded</span>
              <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => window.open(details.invitationUrl)} style={{ padding: '0 3px', fontSize: 11, color: C.info }} />
              <Button type="link" size="small" onClick={onRemoveFile} style={{ padding: '0 3px', fontSize: 11, color: C.error }}>✕</Button>
            </div>
          ) : uploading ? (
            <div style={{ background: C.surfaceSec, border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: C.muted }}>Uploading…</span>
                <span style={{ fontSize: 10, color: C.primary, fontWeight: 700 }}>{pct}%</span>
              </div>
              <Progress percent={pct} strokeColor={C.primary} size="small" showInfo={false} />
            </div>
          ) : (
            <Upload accept="image/*,.pdf" showUploadList={false} customRequest={onUpload}>
              <Button size="small" icon={errored ? <WarningOutlined /> : <UploadOutlined />}
                style={{ width: '100%', borderColor: errored ? C.error : C.primaryL, color: errored ? C.error : C.primary, background: errored ? C.error + '08' : C.primary + '06' }}>
                {errored ? 'Retry' : 'Upload Card'}
              </Button>
            </Upload>
          )}
        </div>
        <div>
          <Label>Note (optional)</Label>
          <Input size="small" placeholder="Any notes…" value={details?.note || ''}
            onChange={e => onUpdate('note', e.target.value)} style={{ borderColor: C.border }} />
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const MarriageClosingDrawer = ({ visible, onClose, members: allMembers = [], programList = [], currentUser, onSuccess }) => {
  const [step,          setStep]          = useState(0)
  const [selectedProg,  setSelectedProg]  = useState(null)
  const [ageGroups,     setAgeGroups]     = useState([])
  const [memberGroups,  setMemberGroups]  = useState([])
  const [selectedIds,   setSelectedIds]   = useState([])
  const [selectedMap,   setSelectedMap]   = useState({})
  const [details,       setDetails]       = useState({})
  const [uploadProgress, setUploadProgress] = useState({})
  const [processing,    setProcessing]    = useState(false)

  const [displayed,     setDisplayed]     = useState([])
  const [search,        setSearch]        = useState('')
  const [listLoading,   setListLoading]   = useState(false)
  const [searchMode,    setSearchMode]    = useState(false)
  const [hasMore,       setHasMore]       = useState(false)
  const [lastDoc,       setLastDoc]       = useState(null)
  const [loadingMore,   setLoadingMore]   = useState(false)

  const PAGE    = 20
  const listRef = useRef(null)
  const program = programList.find(p => p.id === selectedProg)

  // ── load first page — filter by flat programId field ──────────────────────
  const loadPage = useCallback(async (programId) => {
    if (!programId) return
    setListLoading(true); setSearchMode(false); setSearch('')
    try {
      const r = await fetchMembersPaginated({
        programId,          // firebase-helpers now uses where("programId","==",programId)
        status: 'active',
        pageSize: PAGE,
        lastDoc: null,
        search: '',
      })
      // members already filtered by programId in the query — no client-side filter needed
      setDisplayed(r.members || [])
      setLastDoc(r.lastDoc || null)
      setHasMore(r.hasNextPage || false)
    } catch (e) { console.error(e); message.error('Failed to load members') }
    finally { setListLoading(false) }
  }, [])

  // ── load more ──────────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!selectedProg || !hasMore || loadingMore || searchMode) return
    setLoadingMore(true)
    try {
      const r = await fetchMembersPaginated({
        programId: selectedProg, status: 'active', pageSize: PAGE, lastDoc, search: '',
      })
      setDisplayed(p => [...p, ...(r.members || [])])
      setLastDoc(r.lastDoc || null)
      setHasMore(r.hasNextPage || false)
    } catch (e) { console.error(e) }
    finally { setLoadingMore(false) }
  }, [selectedProg, hasMore, loadingMore, searchMode, lastDoc])

  const handleScroll = useCallback(e => {
    const el = e.target
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) loadMore()
  }, [loadMore])

  const handleSearch = useCallback(async (val) => {
    setSearch(val)
    if (!val) { loadPage(selectedProg); return }
    setListLoading(true)
    try {
      // fetchAllMembersForSearch already filters by agentId but not programId in search mode —
      // filter client-side by flat programId field
      const r = await fetchAllMembersForSearch(val, 'all')
      setDisplayed(r.filter(m => m.programId === selectedProg))
      setSearchMode(true); setHasMore(false)
    } catch (e) { console.error(e) }
    finally { setListLoading(false) }
  }, [selectedProg, loadPage])

  useEffect(() => {
    if (step === 2 && selectedProg) loadPage(selectedProg)
  }, [step, selectedProg])

  // ── storage helpers ────────────────────────────────────────────────────────
  const delFile = async (url) => { if (!url) return; try { await deleteObject(ref(storage, url)) } catch (e) { console.error(e) } }

  const removeMember = async (id) => {
    await delFile(details[id]?.invitationUrl).catch(console.error)
    setSelectedIds(p => p.filter(x => x !== id))
    setSelectedMap(p => { const n = { ...p }; delete n[id]; return n })
    setDetails(p => { const n = { ...p }; delete n[id]; return n })
    setUploadProgress(p => { const n = { ...p }; delete n[id]; return n })
  }

  const resetAll = async () => {
    await Promise.all(selectedIds.map(id => delFile(details[id]?.invitationUrl).catch(console.error)))
    setStep(0); setSelectedProg(null); setAgeGroups([]); setMemberGroups([])
    setSelectedIds([]); setSelectedMap({}); setDetails({}); setUploadProgress({})
    setDisplayed([]); setSearch(''); setSearchMode(false); setHasMore(false); setLastDoc(null)
  }

  const handleClose = () => {
    if (selectedIds.length) {
      confirm({
        title: 'Close without saving?', icon: <WarningOutlined />,
        content: 'All selections and uploads will be lost.',
        okText: 'Yes, Close', okType: 'danger', cancelText: 'Cancel',
        onOk: async () => { await resetAll(); onClose() },
      })
    } else { resetAll(); onClose() }
  }

  const defaultDetail  = () => ({ marriageDate: dayjs(), note: '', invitationUrl: '' })
  const updateDetail   = (id, field, val) => setDetails(p => ({ ...p, [id]: { ...p[id], [field]: val } }))
  const isAlreadyClosed = (member) => (member.closedStatus || []).some(cs => cs.programId === selectedProg && cs.closingGroupId)

  const handleToggle = async (member, checked) => {
    if (isAlreadyClosed(member)) { message.warning(`${member.displayName || member.name} is already closed`); return }
    if (checked) {
      setSelectedIds(p => [...p, member.id])
      setSelectedMap(p => ({ ...p, [member.id]: member }))
      setDetails(p => ({ ...p, [member.id]: defaultDetail() }))
    } else { await removeMember(member.id) }
  }

  const handleSelectPage = (checked) => {
    if (checked) {
      const eligible = displayed.filter(m => !isAlreadyClosed(m))
      setSelectedIds(p => [...new Set([...p, ...eligible.map(m => m.id)])])
      const map = {}; eligible.forEach(m => { map[m.id] = m })
      setSelectedMap(p => ({ ...p, ...map }))
      const d = { ...details }; eligible.forEach(m => { if (!d[m.id]) d[m.id] = defaultDetail() }); setDetails(d)
    } else {
      const pageIds = new Set(displayed.map(m => m.id))
      setSelectedIds(p => p.filter(id => !pageIds.has(id)))
      const m = { ...selectedMap }; pageIds.forEach(id => delete m[id]); setSelectedMap(m)
    }
  }

  const eligibleOnPage    = displayed.filter(m => !isAlreadyClosed(m))
  const allPageSelected   = eligibleOnPage.length > 0 && eligibleOnPage.every(m => selectedIds.includes(m.id))
  const alreadyClosedCount = displayed.filter(m => isAlreadyClosed(m)).length

  const makeUploader = (memberId) => ({ file, onSuccess: ok, onError: err, onProgress }) => {
    const ext  = file.name.split('.').pop()
    const path = `closing-invitations/${memberId}/${Date.now()}.${ext}`
    const task = uploadBytesResumable(ref(storage, path), file)
    setUploadProgress(p => ({ ...p, [memberId]: 0 }))
    task.on('state_changed',
      snap => {
        const pct = Math.round(snap.bytesTransferred / snap.totalBytes * 100)
        setUploadProgress(p => ({ ...p, [memberId]: pct })); onProgress({ percent: pct })
      },
      e => { setUploadProgress(p => ({ ...p, [memberId]: 'error' })); message.error('Upload failed'); err(e) },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref)
        updateDetail(memberId, 'invitationUrl', url)
        setUploadProgress(p => ({ ...p, [memberId]: 'done' }))
        message.success('Invitation uploaded!'); ok({ url })
      }
    )
  }

  const handleRemoveFile = async (id) => {
    await delFile(details[id]?.invitationUrl)
    updateDetail(id, 'invitationUrl', ''); setUploadProgress(p => ({ ...p, [id]: 0 }))
  }

  const handleSubmit = async () => {
    const noDate = selectedIds.filter(id => !details[id]?.marriageDate)
    if (noDate.length) { message.warning('Please set marriage date for all members'); return }
    confirm({
      title: 'Confirm Marriage Closing',
      icon: <HeartFilled style={{ color: C.primary }} />,
      content: <p>Close marriage for <strong>{selectedIds.length}</strong> member(s)?</p>,
      okText: 'Confirm', okType: 'primary', cancelText: 'Cancel',
      onOk: async () => {
        setProcessing(true)
        try {
          const groupId = `${selectedProg}${Date.now()}`
          const memberClosingList = selectedIds.map(memberId => {
            const d = details[memberId]
            return {
              id:                   `${groupId}_${memberId}`,
              closed_memberId:      memberId,
              groupId,
              member_closed_program: selectedProg,
              closed_date:          d.marriageDate ? d.marriageDate.toISOString() : new Date().toISOString(),
              closed_note:          d.note || '',
              closed_invitation_url: d.invitationUrl || '',
            }
          })
          const result = await paymentApi.closedPaymentEntry({
            count: selectedIds.length,
            memberIds: selectedIds,
            closedBy: currentUser?.uid,
            groupId,
            closedByName: currentUser?.displayName || 'Unknown',
            programId: selectedProg,
            ageGroups,
            memberGroups,
            memberClosingList,
          })
          if (!result?.success) throw new Error(result?.message || 'API returned failure')
          const processed = result.summary?.membersProcessed ?? selectedIds.length
          const skipped   = result.summary?.skippedMembers   ?? []
          if (skipped.length) message.warning(`Closed ${processed} member(s). ${skipped.length} skipped.`)
          else                message.success(`Marriage closed for ${processed} member(s)`)
          await resetAll(); onSuccess()
        } catch (e) {
          console.error(e); message.error(e?.message || 'Failed to process. Please try again.')
        } finally { setProcessing(false) }
      },
    })
  }

  const completedCount = selectedIds.filter(id => details[id]?.marriageDate && details[id]?.invitationUrl).length

  return (
    <Drawer
      open={visible} onClose={handleClose} placement="right" width={900} closable={false}
      styles={{
        body:   { padding: 0, background: C.bg },
        header: { background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '12px 20px' },
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 3px 10px ${C.primary}40` }}>
              <HeartFilled style={{ color: '#fff', fontSize: 20 }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: C.fg }}>Marriage Closing</div>
              <div style={{ fontSize: 11, color: C.muted }}>Register member marriage details</div>
            </div>
            {selectedIds.length > 0 && (
              <Badge count={selectedIds.length} style={{ backgroundColor: C.primary }}>
                <span style={{ background: C.primary + '18', color: C.primary, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>selected</span>
              </Badge>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={handleClose} icon={<CloseOutlined />} style={{ borderColor: C.border, color: C.fgSec }}>Cancel</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={processing}
              disabled={!selectedIds.length}
              style={{ background: selectedIds.length ? grad : undefined, border: 'none', fontWeight: 700 }}>
              Save {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
            </Button>
          </div>
        </div>
      }
      footer={null}
    >
      <div style={{ padding: '20px 24px', minHeight: '100%' }}>
        <StepBar step={step} />

        {/* stats strip */}
        {selectedProg && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
            {[
              { label: 'Loaded',    value: displayed.length + (hasMore ? '+' : ''), color: C.info,    icon: <TeamOutlined /> },
              { label: 'Closed',    value: alreadyClosedCount,                      color: C.warning,  icon: <CheckCircleOutlined /> },
              { label: 'Selected',  value: selectedIds.length,                      color: C.primary,  icon: <CheckCircleOutlined /> },
              { label: 'Complete',  value: `${completedCount}/${selectedIds.length}`, color: C.success, icon: <HeartFilled /> },
            ].map(s => (
              <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 7, background: s.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, fontSize: 15 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: '22px' }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── step 0: program ── */}
        {step === 0 && (
          <div>
            <SectionHeader icon={<FlagOutlined />} title="Select Program" subtitle="Choose the marriage program" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {programList.map(prog => {
                const active = selectedProg === prog.id
                return (
                  <div key={prog.id} onClick={() => setSelectedProg(prog.id)} style={{
                    background: C.surface, border: `2px solid ${active ? C.primary : C.border}`,
                    borderRadius: 12, padding: '14px 18px', cursor: 'pointer',
                    boxShadow: active ? `0 3px 12px ${C.primary}20` : '0 1px 3px rgba(0,0,0,.04)',
                    display: 'flex', alignItems: 'center', gap: 12, transition: 'all .2s',
                  }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, border: `2px solid ${active ? C.primary : C.border}`, background: active ? C.primary : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.fg }}>{prog.name}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            {selectedProg && (
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="primary" size="large" icon={<ArrowRightOutlined />} onClick={() => setStep(1)}
                  style={{ background: grad, border: 'none', fontWeight: 700, height: 42, paddingInline: 24 }}>
                  Next: Groups
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── step 1: groups ── */}
        {step === 1 && program && (
          <div>
            <SectionHeader icon={<ApartmentOutlined />} title="Filter by Groups" subtitle="Optional — skip to select all members"
              action={<Button size="small" onClick={() => setStep(0)} icon={<ArrowLeftOutlined />}>Back</Button>} />
            <Collapse defaultActiveKey={['1', '2']} style={{ marginBottom: 16 }}>
              <Panel header={<Space><CalendarOutlined style={{ color: C.primary }} /><strong>Age Groups</strong>{ageGroups.length > 0 && <Tag color="blue">{ageGroups.length} selected</Tag>}</Space>} key="1">
                <Checkbox.Group value={ageGroups} onChange={setAgeGroups} style={{ width: '100%' }}>
                  <Row gutter={[12, 8]}>
                    {program.ageGroups?.map(ag => (
                      <Col span={8} key={ag.id}>
                        <Checkbox value={ag.id}><span style={{ fontWeight: 600 }}>{ag.ageGroupName}</span><span style={{ fontSize: 11, color: C.muted }}> ({ag.startAge}-{ag.endAge}y)</span></Checkbox>
                      </Col>
                    ))}
                  </Row>
                </Checkbox.Group>
              </Panel>
              <Panel header={<Space><TeamOutlined style={{ color: C.secondary }} /><strong>Member Groups</strong>{memberGroups.length > 0 && <Tag color="orange">{memberGroups.length} selected</Tag>}</Space>} key="2">
                <Checkbox.Group value={memberGroups} onChange={setMemberGroups} style={{ width: '100%' }}>
                  <Row gutter={[12, 8]}>
                    {program.memberGroups?.map(g => (
                      <Col span={8} key={g.id}><Checkbox value={g.id}>{g.groupName} <Tag color="purple" style={{ fontSize: 10 }}>{g.code}</Tag></Checkbox></Col>
                    ))}
                  </Row>
                </Checkbox.Group>
              </Panel>
            </Collapse>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Tag color="green">All eligible members shown</Tag>
              <Space>
                <Button onClick={() => { setAgeGroups([]); setMemberGroups([]) }}>Clear</Button>
                <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => setStep(2)} style={{ background: grad, border: 'none' }}>Next: Select Members</Button>
              </Space>
            </div>
          </div>
        )}

        {/* ── step 2: member selection ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)' }}>
            <SectionHeader icon={<TeamOutlined />} title="Select Members"
              subtitle={searchMode ? 'Search results' : 'Scroll to load more'}
              action={<Button size="small" onClick={() => setStep(1)} icon={<ArrowLeftOutlined />}>Back</Button>} />
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
              <Input prefix={<SearchOutlined style={{ color: C.muted }} />}
                placeholder="Search name, reg. no, phone, village…"
                value={search} onChange={e => handleSearch(e.target.value)} allowClear
                style={{ flex: 1, borderRadius: 8 }}
                suffix={listLoading && <Spin size="small" />} />
              <Button icon={<ReloadOutlined />} onClick={() => loadPage(selectedProg)} title="Reload" />
              <Button size="small" type={allPageSelected ? 'primary' : 'default'}
                onClick={() => handleSelectPage(!allPageSelected)} style={{ whiteSpace: 'nowrap', minWidth: 120 }}>
                {allPageSelected ? 'Deselect Page' : 'Select Eligible'}
              </Button>
            </div>
            {selectedIds.length > 0 && (
              <div style={{ background: C.primary + '08', border: `1px solid ${C.primary}30`, borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.primary }}>{selectedIds.length} member(s) selected</span>
                <Button size="small" type="link" danger onClick={async () => {
                  await Promise.all(selectedIds.map(id => delFile(details[id]?.invitationUrl).catch(console.error)))
                  setSelectedIds([]); setSelectedMap({}); setDetails({}); setUploadProgress({})
                }}>Clear All</Button>
              </div>
            )}
            <div ref={listRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              {listLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin tip="Loading members…" /></div>
              ) : displayed.length === 0 ? (
                <Empty description={searchMode ? 'No matches' : 'No members in this program'} style={{ padding: '40px 0' }} />
              ) : (
                <>
                  {displayed.map(member => (
                    <MemberSelectCard key={member.id} member={member}
                      checked={selectedIds.includes(member.id)}
                      onChange={checked => handleToggle(member, checked)}
                      programId={selectedProg} />
                  ))}
                  {loadingMore && <div style={{ textAlign: 'center', padding: '12px 0' }}><Spin size="small" /><span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>Loading more…</span></div>}
                  {!hasMore && !searchMode && displayed.length > 0 && (
                    <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 11, color: C.muted }}>— All {displayed.length} members loaded —</div>
                  )}
                  {searchMode && <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 11, color: C.muted }}>{displayed.length} result(s)</div>}
                </>
              )}
            </div>
            {selectedIds.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="primary" size="large" icon={<ArrowRightOutlined />} onClick={() => setStep(3)}
                  style={{ background: grad, border: 'none', fontWeight: 700, height: 42, paddingInline: 24 }}>
                  Add Details ({selectedIds.length})
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── step 3: details ── */}
        {step === 3 && (
          <div>
            <SectionHeader icon={<FileTextOutlined />} title="Marriage Details"
              subtitle={`Fill details for ${selectedIds.length} member(s)`}
              action={<Button size="small" onClick={() => setStep(2)} icon={<ArrowLeftOutlined />}>Back</Button>} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surfaceSec, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <CalendarOutlined style={{ color: C.primary }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.fg }}>Set same date for all:</span>
              <DatePicker size="small" format="DD/MM/YYYY" placeholder="Common date" allowClear={false}
                onChange={date => {
                  if (!date) return
                  const updated = {}
                  selectedIds.forEach(id => { updated[id] = { ...(details[id] || {}), marriageDate: date } })
                  setDetails(p => ({ ...p, ...updated }))
                }}
                style={{ width: 150 }} />
              <span style={{ fontSize: 11, color: C.muted }}>— or set individually below</span>
            </div>
            <div style={{ maxHeight: 'calc(100vh - 380px)', overflowY: 'auto', paddingRight: 4 }}>
              {selectedIds.map(id => {
                const member = selectedMap[id] || allMembers.find(m => m.id === id)
                return (
                  <MemberDetailRow key={id} member={member} details={details[id]} progress={uploadProgress[id]}
                    onUpdate={(f, v) => updateDetail(id, f, v)} onRemove={() => removeMember(id)}
                    onUpload={makeUploader(id)} onRemoveFile={() => handleRemoveFile(id)} />
                )
              })}
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Button type="primary" size="large" icon={<CheckCircleOutlined />}
                onClick={handleSubmit} loading={processing}
                style={{ background: grad, border: 'none', height: 46, paddingInline: 40, fontWeight: 700 }}>
                Complete Closing for {selectedIds.length} Members
              </Button>
              {!selectedIds.every(id => details[id]?.invitationUrl) && (
                <Alert message="Some members don't have invitation cards — you can still proceed" type="warning" showIcon style={{ width: '100%' }} />
              )}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}

export default MarriageClosingDrawer