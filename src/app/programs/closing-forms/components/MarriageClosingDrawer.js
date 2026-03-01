"use client"
import React, { useState, useEffect } from 'react'
import {
  Drawer, Badge, Card, Tag, Button,
  Alert, Table, Checkbox, Avatar, Empty, List,
  DatePicker, Upload, message,
  Steps, Progress, Typography, Modal, Statistic, Space, Row, Col, Input,
  TreeSelect, Collapse
} from 'antd'
import {
  CloseOutlined, UserOutlined, DeleteOutlined,
  UploadOutlined, CheckCircleOutlined, PlusOutlined,
  CalendarOutlined, FileTextOutlined, TeamOutlined,
  FlagOutlined, ArrowRightOutlined, ArrowLeftOutlined,
  SaveOutlined, EyeOutlined, InboxOutlined, WarningOutlined,
  GiftOutlined, HeartOutlined, HeartFilled, ApartmentOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../../../../../lib/firbase-client'
import { paymentApi } from '@/utils/api'
import { Colors } from '@/constent/antdTheme'

const { TextArea } = Input
const { confirm } = Modal
const { Panel } = Collapse

// Theme colors from CSS variables
const C = Colors

// Gradient helpers
const gradPrimary = `linear-gradient(135deg, ${C.primary} 0%, ${C.secondary} 100%)`
const gradWarm    = `linear-gradient(135deg, ${C.secondaryL} 0%, ${C.tertiary} 100%)`
const gradSuccess = `linear-gradient(135deg, ${C.success} 0%, ${C.accent} 100%)`

// ─── Tiny reusable pill ──────────────────────────────────────────────────────
const Pill = ({ children, color = C.primary, bg }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
    background: bg || color + '18', color
  }}>{children}</span>
)

// ─── Step pill indicator ─────────────────────────────────────────────────────
const StepBar = ({ step }) => {
  const steps = ['Program', 'Age Groups', 'Members', 'Details']
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      background: C.surfaceSec, borderRadius: 12, padding: '12px 20px',
      marginBottom: 24, border: `1px solid ${C.border}`
    }}>
      {steps.map((label, i) => {
        const active  = i === step
        const done    = i < step
        return (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13,
                background: done ? gradSuccess : active ? gradPrimary : C.border,
                color: done || active ? '#fff' : C.muted,
                transition: 'all .3s',
                flexShrink: 0
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? C.primary : done ? C.accent : C.muted,
                whiteSpace: 'nowrap'
              }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: '0 10px', minWidth: 20,
                background: done ? C.accent : C.border, borderRadius: 2,
                transition: 'background .3s'
              }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Section header ──────────────────────────────────────────────────────────
const SectionHeader = ({ icon, title, subtitle, action }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 20
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: gradPrimary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 18, flexShrink: 0
      }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.fg }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: C.muted }}>{subtitle}</div>}
      </div>
    </div>
    {action}
  </div>
)

// ─── Member avatar card (compact) ───────────────────────────────────────────
const MemberInfo = ({ member, size = 36 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <Avatar
      src={member?.photoURL}
      icon={<UserOutlined />}
      size={size}
      style={{ border: `2px solid ${C.primaryL}`, flexShrink: 0 }}
    />
    <div>
      <div style={{ fontWeight: 600, color: C.fg, fontSize: 14, lineHeight: '18px' }}>
        {member?.displayName || member?.name}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
        <Pill color={C.info}>{member?.registrationNumber}</Pill>
        {member?.phone && <Pill color={C.accent}>{member?.phone}</Pill>}
      </div>
    </div>
  </div>
)

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const MarriageClosingDrawer = ({
  visible, onClose, members = [], programList = [], currentUser, onSuccess
}) => {
  const [selectedProgram, setSelectedProgram] = useState(null)
  const [selectedAgeGroups, setSelectedAgeGroups] = useState([])
  const [selectedMemberGroups, setSelectedMemberGroups] = useState([])
  const [selectedMembersList, setSelectedMembersList] = useState([])
  const [memberDetails, setMemberDetails] = useState({})
  const [processing, setProcessing] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [uploadProgress, setUploadProgress] = useState({})

  // Get selected program object
  const program = programList.find(p => p.id === selectedProgram)

  // ── Function to delete file from storage ─────────────────────────────────
  const deleteFileFromStorage = async (url) => {
    if (!url) return
    try {
      const storageRef = ref(storage, url)
      await deleteObject(storageRef)
      console.log('File deleted successfully')
    } catch (error) {
      console.error('Error deleting file:', error)
    }
  }

  // ── Function to handle member removal with file cleanup ──────────────────
  const removeMemberWithCleanup = async (memberId) => {
    const details = memberDetails[memberId]
    
    if (details?.invitationUrl) {
      try {
        await deleteFileFromStorage(details.invitationUrl)
      } catch (error) {
        console.error('Failed to delete file:', error)
      }
    }

    setSelectedMembersList(prev => prev.filter(id => id !== memberId))
    setMemberDetails(prev => {
      const newDetails = { ...prev }
      delete newDetails[memberId]
      return newDetails
    })
    setUploadProgress(prev => {
      const newProgress = { ...prev }
      delete newProgress[memberId]
      return newProgress
    })
  }

  // ── Get members based on selected filters ───────────────────────────────
  const getFilteredMembers = () => {
    if (!selectedProgram) return []
    
    return members.filter(m => {
      // Check if member is not already closed
      if (m.member_closed) return false
      
      // Check if member belongs to selected program
      if (!m.programIds?.includes(selectedProgram)) return false
      

      return true
    })
  }

  const availableMembers = getFilteredMembers()
  const availableMembersCount = availableMembers.length
  const completedCount = selectedMembersList.filter(id =>
    memberDetails[id]?.marriageDate && memberDetails[id]?.invitationUrl
  ).length

  // ── Reset ────────────────────────────────────────────────────────────────
  const resetState = async () => {
    for (const memberId of selectedMembersList) {
      const details = memberDetails[memberId]
      if (details?.invitationUrl) {
        await deleteFileFromStorage(details.invitationUrl).catch(console.error)
      }
    }
    
    setSelectedProgram(null)
    setSelectedAgeGroups([])
    setSelectedMemberGroups([])
    setSelectedMembersList([])
    setMemberDetails({})
    setCurrentStep(0)
    setUploadProgress({})
  }

  const handleClose = () => {
    if (selectedMembersList.length > 0) {
      confirm({
        title: 'Close without saving?',
        icon: <WarningOutlined />,
        content: 'All selected members, uploaded files, and progress will be lost.',
        okText: 'Yes, Close', 
        okType: 'danger', 
        cancelText: 'Cancel',
        onOk: async () => { 
          await resetState()
          onClose() 
        }
      })
    } else { 
      resetState()
      onClose() 
    }
  }

  // ── Member selection ─────────────────────────────────────────────────────
  const defaultDetail = () => ({ marriageDate: dayjs(), note: '', invitationCard: null, invitationUrl: '' })

  const handleMemberSelect = async (id, checked) => {
    if (checked) {
      setSelectedMembersList(p => [...p, id])
      setMemberDetails(p => ({ ...p, [id]: defaultDetail() }))
    } else {
      await removeMemberWithCleanup(id)
    }
  }

  const handleSelectAll = async (checked) => {
    if (checked) {
      setSelectedMembersList(availableMembers.map(m => m.id))
      const d = {}; 
      availableMembers.forEach(m => { d[m.id] = defaultDetail() }); 
      setMemberDetails(d)
    } else { 
      for (const memberId of selectedMembersList) {
        const details = memberDetails[memberId]
        if (details?.invitationUrl) {
          await deleteFileFromStorage(details.invitationUrl).catch(console.error)
        }
      }
      setSelectedMembersList([])
      setMemberDetails({})
      setUploadProgress({})
    }
  }

  const updateDetail = (id, field, val) =>
    setMemberDetails(p => ({ ...p, [id]: { ...p[id], [field]: val } }))

  // ── File upload ──────────────────────────────────────────────────────────
  const handleFileUpload = async (memberId, file) => {
    setUploadProgress(p => ({ ...p, [memberId]: 0 }))
    const storageRef = ref(storage, `closing-invitations/${memberId}/${file.name}_${Date.now()}`)
    const task = uploadBytesResumable(storageRef, file)
    
    task.on('state_changed',
      snap => setUploadProgress(p => ({ ...p, [memberId]: Math.round((snap.bytesTransferred / snap.totalBytes) * 100) })),
      () => { 
        message.error('Upload failed'); 
        setUploadProgress(p => ({ ...p, [memberId]: 0 })) 
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref)
        updateDetail(memberId, 'invitationUrl', url)
        updateDetail(memberId, 'invitationCard', file)
        setUploadProgress(p => ({ ...p, [memberId]: 100 }))
        message.success('Invitation uploaded!')
      }
    )
    return false
  }

  // ── Remove invitation file ───────────────────────────────────────────────
  const handleRemoveInvitation = async (memberId) => {
    const details = memberDetails[memberId]
    if (details?.invitationUrl) {
      try {
        await deleteFileFromStorage(details.invitationUrl)
        updateDetail(memberId, 'invitationUrl', '')
        updateDetail(memberId, 'invitationCard', null)
        setUploadProgress(p => ({ ...p, [memberId]: 0 }))
        message.success('Invitation removed')
      } catch (error) {
        message.error('Failed to remove file')
      }
    }
  }

  const generate_payment_entry = async (data) => {
    try {
      const res = await paymentApi.closedPaymentEntry(data)
      console.log(res, "res123")
    } catch (error) {
      console.log(error)
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmitAll = async () => {
    const invalid = selectedMembersList.filter(id => !memberDetails[id]?.marriageDate)
    if (invalid.length) { 
      message.warning('Please set marriage date for all members'); 
      return 
    }

    confirm({
      title: 'Confirm Marriage Closing',
      icon: <HeartFilled style={{ color: C.primary }} />,
      content: <p>Close marriage for <strong>{selectedMembersList.length}</strong> member(s)? This cannot be undone.</p>,
      okText: 'Confirm', 
      okType: 'primary', 
      cancelText: 'Cancel',
      onOk: async () => {
        setProcessing(true)
        try {
          // 1. Create the Group Closing Header Record
        //   const groupData = {
        //     count: selectedMembersList.length,
        //     memberIds: selectedMembersList,
        //     closedBy: currentUser?.uid,
        //     closedByName: currentUser?.displayName || 'Unknown',
        //     closedAt: serverTimestamp(),
        //     programId: selectedProgram,
        //     ageGroups: selectedAgeGroups,
        //     memberGroups: selectedMemberGroups,
        //     type: 'GROUP_CLOSING'
        //   }
        //   const groupRef = await addDoc(collection(db, 'groupClosings'), groupData)
        //   const groupId = groupRef.id

        //   // 2. Process Individual Members
        //   for (const memberId of selectedMembersList) {
        //     const d = memberDetails[memberId]
        //     const member = members.find(m => m.id === memberId)
            
        //     const closingData = {
        //       memberId, 
        //       groupId,
        //       programId: selectedProgram,
        //       marriageDate: d.marriageDate.toISOString(),
        //       note: d.note, 
        //       invitationUrl: d.invitationUrl || '',
        //       closedBy: currentUser?.uid,
        //       closedByName: currentUser?.displayName || 'Unknown',
        //       closedAt: serverTimestamp(),
        //       memberName: member?.displayName || member?.name,
        //       registrationNumber: member?.registrationNumber,
        //       ageGroupId: member?.ageGroupId || member?.ageGroup,
        //       memberGroupId: member?.memberGroupId || member?.groupId
        //     }

        //     await addDoc(collection(db, 'memberClosings'), closingData)

        //     await updateDoc(doc(db, 'members', memberId), {
        //       member_closed: true,
        //       member_closed_at: serverTimestamp(),
        //       member_closed_by: currentUser?.uid,
        //       member_closed_program: selectedProgram,
        //       closed_group_id: groupId,
        //       closed_date: d.marriageDate.toISOString(),
        //       closed_note: d.note,
        //       closed_invitation_url: d.invitationUrl || ''
        //     })
        //   }
const memberClosingList=  selectedMembersList.map((memberId)=>{
 const d = memberDetails[memberId]
            const member = members.find(m => m.id === memberId)
    const newData= {
              member_closed: true,
              member_closed_at: serverTimestamp(),
              member_closed_by: currentUser?.uid,
              member_closed_program: selectedProgram,
              closed_date: d.marriageDate.toISOString(),
              closed_note: d.note,
              closed_invitation_url: d.invitationUrl || ''
            }
            return newData
})

          const data = {
          count: selectedMembersList.length,
            memberIds: selectedMembersList,
            closedBy: currentUser?.uid,
            closedByName: currentUser?.displayName || 'Unknown',
            closedAt: serverTimestamp(),
            programId: selectedProgram,
            ageGroups: selectedAgeGroups,
            memberGroups: selectedMemberGroups,
            memberClosingList
          }
          await generate_payment_entry(data)
      
          message.success(`Successfully closed marriage for ${selectedMembersList.length} members`)
          
          resetState()
          onSuccess()
        } catch (e) {
          console.error(e); 
          message.error('Failed to process some members')
        } finally { 
          setProcessing(false) 
        }
      }
    })
  }

  const allHaveInvitation = selectedMembersList.every(id => memberDetails[id]?.invitationUrl)

  // ── Selection table columns ───────────────────────────────────────────────
  const selectionColumns = [
    {
      title: (
        <Checkbox
          checked={selectedMembersList.length === availableMembers.length && availableMembers.length > 0}
          indeterminate={selectedMembersList.length > 0 && selectedMembersList.length < availableMembers.length}
          onChange={e => handleSelectAll(e.target.checked)}
        />
      ),
      key: 'select', width: 50,
      render: (_, r) => (
        <Checkbox
          checked={selectedMembersList.includes(r.id)}
          onChange={e => handleMemberSelect(r.id, e.target.checked)}
        />
      )
    },
    {
      title: 'Member', key: 'member',
      render: (_, r) => <MemberInfo member={r} />
    }
  ]

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <Drawer
      open={visible}
      onClose={handleClose}
      placement="right"
      width={900}
      closable={false}
      styles={{ body: { padding: 0, background: C.bg }, header: { background: C.surface, borderBottom: `1px solid ${C.border}` } }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: gradPrimary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 12px ${C.primary}40`
            }}>
              <HeartFilled style={{ color: '#fff', fontSize: 22 }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: C.fg, lineHeight: '22px' }}>Marriage Closing</div>
              <div style={{ fontSize: 12, color: C.muted }}>Register member marriage details</div>
            </div>
            {selectedMembersList.length > 0 && (
              <span style={{
                background: gradPrimary, color: '#fff',
                borderRadius: 999, padding: '2px 12px', fontSize: 13, fontWeight: 700
              }}>
                {selectedMembersList.length} selected
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button onClick={handleClose} icon={<CloseOutlined />} style={{ borderColor: C.border, color: C.fgSec }}>
              Cancel
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSubmitAll}
              loading={processing}
              disabled={selectedMembersList.length === 0}
              style={{
                background: selectedMembersList.length ? gradPrimary : undefined,
                border: 'none',
                fontWeight: 700,
                boxShadow: selectedMembersList.length ? `0 4px 12px ${C.primary}40` : undefined
              }}
            >
              Save All {selectedMembersList.length > 0 ? `(${selectedMembersList.length})` : ''}
            </Button>
          </div>
        </div>
      }
      footer={null}
    >
      <div style={{ padding: '24px 28px', minHeight: '100%' }}>

        {/* Step bar */}
        <StepBar step={currentStep} />

        {/* Stats strip */}
        {selectedProgram && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12, marginBottom: 24
          }}>
            {[
              { label: 'Available', value: availableMembersCount, color: C.info, icon: <TeamOutlined /> },
              { label: 'Selected', value: selectedMembersList.length, color: C.primary, icon: <CheckCircleOutlined /> },
              { label: 'Complete', value: `${completedCount}/${selectedMembersList.length}`, color: C.success, icon: <HeartFilled /> }
            ].map(s => (
              <div key={s.label} style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 12
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: s.color + '15',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: s.color, fontSize: 16
                }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: '24px' }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* STEP 0: Program Selection */}
        {currentStep === 0 && (
          <div>
            <SectionHeader
              icon={<FlagOutlined />}
              title="Select Program"
              subtitle="Choose the marriage program to work with"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {programList.map(prog => {
                const count = members.filter(m => !m.member_closed && m.programIds?.includes(prog.id)).length
                const active = selectedProgram === prog.id
                return (
                  <div
                    key={prog.id}
                    onClick={() => setSelectedProgram(prog.id)}
                    style={{
                      background: C.surface,
                      border: `2px solid ${active ? C.primary : C.border}`,
                      borderRadius: 14, padding: '16px 20px',
                      cursor: 'pointer', transition: 'all .2s',
                      boxShadow: active ? `0 4px 16px ${C.primary}25` : '0 1px 4px rgba(0,0,0,.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: `2px solid ${active ? C.primary : C.border}`,
                        background: active ? C.primary : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, transition: 'all .2s'
                      }}>
                        {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: C.fg }}>{prog.name}</div>
                        <Pill color={count > 0 ? C.success : C.error}>
                          {count > 0 ? `${count} members available` : 'No members'}
                        </Pill>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {selectedProgram && (
              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  type="primary" size="large" icon={<ArrowRightOutlined />}
                  onClick={() => setCurrentStep(1)}
                  style={{ background: gradPrimary, border: 'none', fontWeight: 700, height: 44, paddingInline: 28 }}
                >
                  Next: Select Age Groups
                </Button>
              </div>
            )}
          </div>
        )}

        {/* STEP 1: Age Groups & Member Groups Selection */}
        {currentStep === 1 && program && (
          <div>
            <SectionHeader
              icon={<ApartmentOutlined />}
              title="Select Age Groups & Member Groups"
              subtitle="Choose groups to filter members (optional)"
              action={
                <Button size="small" onClick={() => setCurrentStep(0)} icon={<ArrowLeftOutlined />} style={{ borderColor: C.border, color: C.fgSec }}>
                  Back
                </Button>
              }
            />

            <Collapse defaultActiveKey={['1', '2']} style={{ marginBottom: 20 }}>
              <Panel 
                header={
                  <Space>
                    <CalendarOutlined style={{ color: C.primary }} />
                    <strong>Age Groups</strong>
                    {selectedAgeGroups.length > 0 && (
                      <Tag color="blue">{selectedAgeGroups.length} selected</Tag>
                    )}
                  </Space>
                } 
                key="1"
              >
                <Checkbox.Group
                  value={selectedAgeGroups}
                  onChange={setSelectedAgeGroups}
                  style={{ width: '100%' }}
                >
                  <Row gutter={[16, 8]}>
                    {program.ageGroups?.map(ageGroup => (
                      <Col span={8} key={ageGroup.id}>
                        <Checkbox value={ageGroup.id}>
                          <Space direction="vertical" size={2}>
                            <span style={{ fontWeight: 600 }}>{ageGroup.ageGroupName}</span>
                            <span style={{ fontSize: 11, color: C.muted }}>
                              {ageGroup.startAge}-{ageGroup.endAge} years
                            </span>
                          </Space>
                        </Checkbox>
                      </Col>
                    ))}
                  </Row>
                </Checkbox.Group>
              </Panel>

              <Panel 
                header={
                  <Space>
                    <TeamOutlined style={{ color: C.secondary }} />
                    <strong>Member Groups</strong>
                    {selectedMemberGroups.length > 0 && (
                      <Tag color="orange">{selectedMemberGroups.length} selected</Tag>
                    )}
                  </Space>
                } 
                key="2"
              >
                <Checkbox.Group
                  value={selectedMemberGroups}
                  onChange={setSelectedMemberGroups}
                  style={{ width: '100%' }}
                >
                  <Row gutter={[16, 8]}>
                    {program.memberGroups?.map(group => (
                      <Col span={8} key={group.id}>
                        <Checkbox value={group.id}>
                          <Space>
                            <span>{group.groupName}</span>
                            <Tag color="purple" style={{ fontSize: 10 }}>{group.code}</Tag>
                          </Space>
                        </Checkbox>
                      </Col>
                    ))}
                  </Row>
                </Checkbox.Group>
              </Panel>
            </Collapse>

            {/* Summary of filters */}
            <Alert
              message="Filter Summary"
              description={
                <div>
                  <div>
                    <strong>Age Groups:</strong> {selectedAgeGroups.length === 0 ? 'All' : selectedAgeGroups.length + ' selected'}
                  </div>
                  <div>
                    <strong>Member Groups:</strong> {selectedMemberGroups.length === 0 ? 'All' : selectedMemberGroups.length + ' selected'}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Tag color="green">{availableMembersCount} members match selected filters</Tag>
                  </div>
                </div>
              }
              type="info"
              showIcon
              style={{ marginBottom: 20 }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Button onClick={() => {
                setSelectedAgeGroups([])
                setSelectedMemberGroups([])
              }}>
                Clear All
              </Button>
              <Button
                type="primary"
                icon={<ArrowRightOutlined />}
                onClick={() => setCurrentStep(2)}
                style={{ background: gradPrimary, border: 'none' }}
              >
                Next: Select Members ({availableMembersCount})
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Members Selection */}
        {currentStep === 2 && (
          <div>
            <SectionHeader
              icon={<TeamOutlined />}
              title="Select Members"
              subtitle={`${availableMembersCount} members match your filters`}
              action={
                <Space>
                  <Button size="small" onClick={() => setCurrentStep(1)} icon={<ArrowLeftOutlined />} style={{ borderColor: C.border, color: C.fgSec }}>
                    Back
                  </Button>
                </Space>
              }
            />

            {/* Active filters display */}
            {(selectedAgeGroups.length > 0 || selectedMemberGroups.length > 0) && (
              <div style={{ marginBottom: 16 }}>
                <Space wrap>
                  {selectedAgeGroups.length > 0 && (
                    <Tag icon={<CalendarOutlined />} color="blue">
                      Age Groups: {selectedAgeGroups.length} selected
                    </Tag>
                  )}
                  {selectedMemberGroups.length > 0 && (
                    <Tag icon={<TeamOutlined />} color="orange">
                      Member Groups: {selectedMemberGroups.length} selected
                    </Tag>
                  )}
                </Space>
              </div>
            )}

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <Table
                columns={selectionColumns}
                dataSource={availableMembers}
                rowKey="id"
                pagination={false}
                size="middle"
                rowStyle={{ background: C.surface }}
                locale={{ emptyText: <Empty description="No members available" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              />
            </div>

            {selectedMembersList.length > 0 && (
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  type="primary" size="large" icon={<ArrowRightOutlined />}
                  onClick={() => setCurrentStep(3)}
                  style={{ background: gradPrimary, border: 'none', fontWeight: 700, height: 44, paddingInline: 28 }}
                >
                  Add Details ({selectedMembersList.length})
                </Button>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Details */}
        {currentStep === 3 && (
          <div>
            <SectionHeader
              icon={<FileTextOutlined />}
              title="Marriage Details"
              subtitle="Fill in date, invitation card, and notes for each member"
              action={
                <Button size="small" onClick={() => setCurrentStep(2)} icon={<ArrowLeftOutlined />} style={{ borderColor: C.border, color: C.fgSec }}>
                  Back
                </Button>
              }
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {selectedMembersList.map(memberId => {
                const member = members.find(m => m.id === memberId)
                const details = memberDetails[memberId] || defaultDetail()
                const prog = uploadProgress[memberId] || 0
                const hasFile = !!details.invitationUrl

                return (
                  <div key={memberId} style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 14, overflow: 'hidden'
                  }}>
                    <div style={{
                      padding: '14px 20px',
                      background: C.surfaceSec,
                      borderBottom: `1px solid ${C.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                      <MemberInfo member={member} />
                      <Button
                        type="text" danger size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => handleMemberSelect(memberId, false)}
                        style={{ color: C.error }}
                      >
                        Remove
                      </Button>
                    </div>

                    <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: C.fgSec, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <CalendarOutlined style={{ color: C.primary }} /> Marriage Date <span style={{ color: C.error }}>*</span>
                        </label>
                        <DatePicker
                          style={{ width: '100%' }}
                          value={details.marriageDate}
                          onChange={date => updateDetail(memberId, 'marriageDate', date)}
                          format="DD/MM/YYYY"
                          placeholder="Select date"
                          size="large"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: C.fgSec, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <UploadOutlined style={{ color: C.primary }} /> Invitation Card
                        </label>
                        {hasFile ? (
                          <div style={{
                            border: `2px solid ${C.accentL}`, borderRadius: 10,
                            padding: '10px 14px', background: C.accent + '08',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <CheckCircleOutlined style={{ color: C.success, fontSize: 18 }} />
                              <span style={{ fontSize: 13, fontWeight: 600, color: C.success }}>Uploaded</span>
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <Button type="link" size="small" icon={<EyeOutlined />}
                                onClick={() => window.open(details.invitationUrl)} style={{ color: C.info, padding: '0 6px' }}>
                                View
                              </Button>
                              <Button type="link" size="small"
                                onClick={() => handleRemoveInvitation(memberId)}
                                style={{ color: C.error, padding: '0 6px' }}>
                                Remove
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Upload.Dragger
                            beforeUpload={file => { handleFileUpload(memberId, file); return false }}
                            showUploadList={false}
                            style={{ borderRadius: 10, border: `2px dashed ${C.primaryL}`, background: C.primaryL + '08' }}
                          >
                            {prog > 0 && prog < 100 ? (
                              <div style={{ padding: '8px 0' }}>
                                <Progress percent={Math.round(prog)} strokeColor={C.primary} size="small" />
                              </div>
                            ) : (
                              <div style={{ padding: '8px 0' }}>
                                <InboxOutlined style={{ fontSize: 28, color: C.primaryL }} />
                                <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted }}>Click or drag to upload</p>
                              </div>
                            )}
                          </Upload.Dragger>
                        )}
                      </div>

                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: C.fgSec, display: 'block', marginBottom: 8 }}>
                          Notes (optional)
                        </label>
                        <TextArea
                          rows={2}
                          placeholder="Any notes about the ceremony..."
                          value={details.note}
                          onChange={e => updateDetail(memberId, 'note', e.target.value)}
                          style={{ borderRadius: 8, borderColor: C.border }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {selectedMembersList.length > 0 && (
              <div style={{ marginTop: 20, textAlign: 'center' }}>
                <Button
                  type="primary"
                  size="large"
                  icon={<CheckCircleOutlined />}
                  onClick={handleSubmitAll}
                  loading={processing}
                  style={{
                    background: gradPrimary,
                    border: 'none',
                    height: 48,
                    paddingInline: 40
                  }}
                >
                  Complete Closing for {selectedMembersList.length} Members
                </Button>

                {!allHaveInvitation && (
                  <Alert
                    message="Some members don't have invitation cards"
                    description="You can still proceed without invitation cards"
                    type="warning"
                    showIcon
                    style={{ marginTop: 16, textAlign: 'left' }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  )
}

export default MarriageClosingDrawer