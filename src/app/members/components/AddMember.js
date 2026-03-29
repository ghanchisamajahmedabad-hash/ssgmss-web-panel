"use client"
import { App, Button, Drawer, Form, Spin, Checkbox, Space } from 'antd'
import React, { useState, useEffect, useCallback } from 'react'
import { LoadingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../../../lib/firbase-client'

// Form section components
import BasicInfoForm    from './components/BasicInfoForm'
import AddressForm      from './components/AddressForm'
import GuardianForm     from './components/GuardianForm'
import ProgramSelection from './components/ProgramSelection'
import AddedByForm      from './components/AddedByForm'
import FeesForm         from './components/FeesForm'
import PhotoUploads     from './components/PhotoUploads'
import DocumentUploads  from './components/DocumentUploads'
import { checkAadhaarDuplicate, handleSubmit } from './components/firebaseUtils'

dayjs.extend(isBetween)

// ─── Password generator ───────────────────────────────────────────────────────
const generatePassword = (name, dob) => {
  if (!name || !dob) return ''
  const first = name.trim().split(' ')[0].substring(0, 5)
  const part  = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  return `${part}${dayjs(dob).format('YYYY')}`
}

// ─── Main component ───────────────────────────────────────────────────────────
const AddMember = ({ open, setOpen, programs, agents, currentUser, onSuccess }) => {
  const [form]      = Form.useForm()
  const { message } = App.useApp()
  const [loading,  setLoading]  = useState(false)

  // ── Single program (flat) ──────────────────────────────────────────────────
  const [selectedProgram, setSelectedProgram] = useState('')   // single ID string
  const [programDetail,   setProgramDetail]   = useState(null) // single object

  // ── Dates & age ────────────────────────────────────────────────────────────
  const [joinDate, setJoinDate] = useState(dayjs())
  const [dobDate,  setDobDate]  = useState(null)
  const [age,      setAge]      = useState(null)

  // ── Payment ────────────────────────────────────────────────────────────────
  const [joinFeesDone, setJoinFeesDone] = useState(false)
  const [paymentMode,  setPaymentMode]  = useState('cash')
  const [paidAmount,   setPaidAmount]   = useState(0)

  // ── Added by ───────────────────────────────────────────────────────────────
  const [addedByRole,   setAddedByRole]   = useState('admin')
  const [selectedAgent, setSelectedAgent] = useState(null)

  // ── Files ──────────────────────────────────────────────────────────────────
  const [memberPhoto,    setMemberPhoto]    = useState(null)
  const [guardianPhoto,  setGuardianPhoto]  = useState(null)
  const [memberDocFront, setMemberDocFront] = useState(null)
  const [memberDocBack,  setMemberDocBack]  = useState(null)
  const [guardianDoc,    setGuardianDoc]    = useState(null)

  // ── Aadhaar duplicate check ────────────────────────────────────────────────
  const [existingMember, setExistingMember] = useState(null)

  // ── Location ───────────────────────────────────────────────────────────────
  const [states,           setStates]           = useState([])
  const [districts,        setDistricts]        = useState([])
  const [cities,           setCities]           = useState([])
  const [castes,           setCastes]           = useState([])
  const [relations,        setRelations]        = useState([])
  const [selectedState,    setSelectedState]    = useState(null)
  const [selectedDistrict, setSelectedDistrict] = useState(null)

  // ── Notification options ───────────────────────────────────────────────────
  const [sendWhatsApp, setSendWhatsApp] = useState(true)
  const [sendNotification, setSendNotification] = useState(true)

  // ── Load static data once ──────────────────────────────────────────────────
  useEffect(() => { fetchStaticData() }, [])

  // ── Recalculate program detail when dob / program / joinDate changes ───────
  useEffect(() => {
    if (dobDate && selectedProgram) calculateProgramDetail()
    else if (!dobDate || !selectedProgram) setProgramDetail(null)
  }, [dobDate, joinDate, selectedProgram])

  // ── Static data ────────────────────────────────────────────────────────────
  const fetchStaticData = async () => {
    try {
      const [stSnap, caSnap, relSnap] = await Promise.all([
        getDocs(collection(db, 'states')),
        getDocs(collection(db, 'castes')),
        getDocs(collection(db, 'relations')),
      ])
      const active = (snap) => snap.docs.filter(d => d.data().status === 'active').map(d => ({ id: d.id, ...d.data() }))
      setStates(active(stSnap)); setCastes(active(caSnap)); setRelations(active(relSnap))
    } catch (e) { console.error(e); message.error('Failed to load form data') }
  }

  const fetchDistricts = async (stateId) => {
    try {
      const snap = await getDocs(query(collection(db, 'districts'), where('stateId', '==', stateId)))
      setDistricts(snap.docs.filter(d => d.data().status === 'active').map(d => ({ id: d.id, ...d.data() })))
      setCities([]); form.setFieldsValue({ district: undefined, city: undefined })
    } catch (e) { console.error(e) }
  }

  const fetchCities = async (districtId) => {
    try {
      const snap = await getDocs(query(collection(db, 'cities'), where('districtId', '==', districtId)))
      setCities(snap.docs.filter(d => d.data().status === 'active').map(d => ({ id: d.id, ...d.data() })))
      form.setFieldsValue({ city: undefined })
    } catch (e) { console.error(e) }
  }

  // ── Single-program detail calculation ─────────────────────────────────────
  const calculateProgramDetail = useCallback(() => {
    if (!dobDate || !selectedProgram || !programs?.length) {
      setProgramDetail(null); return
    }

    const calcAge     = dayjs().diff(dobDate, 'year')
    const joinDateStr = joinDate.format('DD-MM-YYYY')
    const program     = programs.find(p => p.id === selectedProgram)

    if (!program?.ageGroups?.length) {
      setProgramDetail({ programId: selectedProgram, programName: program?.name, error: 'No age groups configured' }); return
    }

    const ageGroup = program.ageGroups.find(ag => calcAge >= ag.startAge && calcAge <= ag.endAge)
    if (!ageGroup) {
      setProgramDetail({
        programId: selectedProgram, programName: program.name,
        error: `No age group for age ${calcAge}. Available: ${program.ageGroups.map(ag => `${ag.startAge}-${ag.endAge}`).join(', ')}`
      }); return
    }

    const period = ageGroup.periods?.find(p => {
      try {
        return dayjs(joinDateStr, 'DD-MM-YYYY').isBetween(dayjs(p.startDate, 'DD-MM-YYYY'), dayjs(p.endDate, 'DD-MM-YYYY'), null, '[]')
      } catch { return false }
    })

    if (!period) {
      setProgramDetail({
        programId: selectedProgram, programName: program.name, ageGroupName: ageGroup.ageGroupName,
        ageRange: `${ageGroup.startAge}-${ageGroup.endAge} years`,
        error: `No active period for ${joinDateStr}. Available: ${ageGroup.periods?.map(p => `${p.startDate} to ${p.endDate}`).join(', ')}`
      }); return
    }

    const detail = {
      programId:       selectedProgram,
      programName:     program.name,
      ageGroupId:      ageGroup.id,
      ageGroupName:    ageGroup.ageGroupName,
      ageRange:        `${ageGroup.startAge}-${ageGroup.endAge} years`,
      joinFees:        period.joinFees        || 0,
      fixedJoinFees:   period.fixedJoinFees   || 0,
      payAmount:       period.payAmount       || 0,
      periodStartDate: period.startDate,
      periodEndDate:   period.endDate,
      memberGroupId:   program?.memberGroups?.[0]?.id        || '',
      memberGroupName: program?.memberGroups?.[0]?.groupName || '',
      memberGroupCode: program?.memberGroups?.[0]?.code      || '',
      hasPeriod:       true,
    }
    setProgramDetail(detail)

    // Auto-fill paid amount when joinFeesDone is already true
    if (joinFeesDone && detail.joinFees > 0) {
      setPaidAmount(detail.joinFees)
      form.setFieldsValue({ paidAmount: detail.joinFees })
    }
  }, [dobDate, selectedProgram, joinDate, programs, joinFeesDone, form])

  // ── Event handlers ─────────────────────────────────────────────────────────
  const handleDobChange = (date) => {
    if (!date) { setDobDate(null); setAge(null); setProgramDetail(null); form.setFieldsValue({ password: '' }); return }
    const calcAge = dayjs().diff(date, 'year')
    setDobDate(date); setAge(calcAge)
    form.setFieldsValue({ password: generatePassword(form.getFieldValue('name'), date) })
  }

  const handleProgramChange = (programId) => {
    setSelectedProgram(programId || '')
    if (!programId) setProgramDetail(null)
  }

  const handleJoinDateChange = (date) => { setJoinDate(date) }

  const handleJoinFeesDoneChange = (e) => {
    const isDone = e.target.value
    setJoinFeesDone(isDone)
    if (isDone) {
      const fees = programDetail?.joinFees || 0
      setPaidAmount(fees); form.setFieldsValue({ paidAmount: fees })
    } else {
      setPaidAmount(0); form.setFieldsValue({ paidAmount: 0 })
    }
  }

  const handleStateChange = (v) => {
    setSelectedState(v || null)
    setSelectedDistrict(null)
    if (v) fetchDistricts(v)
    else { setDistricts([]); setCities([]) }
    form.setFieldsValue({ district: undefined, city: undefined })
  }

  const handleDistrictChange = (v) => {
    setSelectedDistrict(v || null)
    if (v) fetchCities(v)
    else setCities([])
    form.setFieldsValue({ city: undefined })
  }
  const handleAadhaarCheck   = async (aadhaar) => { try { return await checkAadhaarDuplicate(aadhaar) } catch { return null } }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const onFormSubmit = async (values) => {
    const addedByName = addedByRole === 'admin'
      ? currentUser?.displayName || 'Admin'
      : agents.find(a => a.uid === selectedAgent)?.name || 'Unknown'

    const success = await handleSubmit(
      values,
      {
        // Single program — pass as the shape handleSubmit expects
        selectedPrograms:  [selectedProgram],    // firebaseUtils still reads [0]
        programDetails:    programDetail ? [programDetail] : [],
        programs,
        states, districts, cities, castes, relations,
        addedByRole, selectedAgent, addedByName,
        joinDate, dobDate, age,
        joinFeesDone, paymentMode, paidAmount,
        memberPhoto, guardianPhoto, memberDocFront, memberDocBack, guardianDoc,
        currentUser, form, setOpen, setLoading,
        // Pass notification options
        sendWhatsApp,
        sendNotification
      },
      message
    )

    if (success) {
      onSuccess?.()
      resetLocalState()
    }
  }

  const resetLocalState = () => {
    setSelectedProgram(''); setProgramDetail(null)
    setMemberPhoto(null); setGuardianPhoto(null)
    setMemberDocFront(null); setMemberDocBack(null); setGuardianDoc(null)
    setCities([]); setDistricts([])
    setSelectedState(null); setSelectedDistrict(null)
    setDobDate(null); setAge(null); setJoinDate(dayjs())
    setJoinFeesDone(false); setPaymentMode('cash'); setPaidAmount(0)
    setAddedByRole('admin'); setSelectedAgent(null)
    setExistingMember(null)
    setSendWhatsApp(true)
    setSendNotification(true)
    form.resetFields()
  }

  return (
    <Drawer
      title="Add New Member"
      open={open}
      onClose={() => !loading && setOpen(false)}
      width={1000}
      footer={null}
      maskClosable={false}
      destroyOnHidden
      closable={!loading}
    >
      <Spin spinning={loading} indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFormSubmit}
          initialValues={{ joinFeesDone: false, addedBy: 'admin', joinDate: dayjs() }}
          disabled={loading}
        >
          <div className="flex flex-col gap-2">

            <BasicInfoForm
              handleDobChange={handleDobChange}
              age={age}
              castes={castes}
              form={form}
              existingMember={existingMember}
              setExistingMember={setExistingMember}
              onAadhaarCheck={handleAadhaarCheck}
            />

            <AddressForm
              states={states} districts={districts} cities={cities}
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
              handleStateChange={handleStateChange}
              handleDistrictChange={handleDistrictChange}
              form={form}
            />

            <GuardianForm relations={relations} />

            {/* ProgramSelection — single select props */}
            <ProgramSelection
              joinDate={joinDate}
              handleJoinDateChange={handleJoinDateChange}
              programs={programs}
              selectedProgram={selectedProgram}          // ← single string
              handleProgramChange={handleProgramChange}  // ← sets single ID
              dobDate={dobDate}
              programDetail={programDetail}              // ← single object
              existingMember={existingMember}
            />

            <AddedByForm
              addedByRole={addedByRole}
              setAddedByRole={setAddedByRole}
              agents={agents}
              selectedAgent={selectedAgent}
              setSelectedAgent={setSelectedAgent}
            />

            {/* FeesForm — pass single-program values */}
            <FeesForm
              joinFeesDone={joinFeesDone}
              handleJoinFeesDoneChange={handleJoinFeesDoneChange}
              paymentMode={paymentMode}
              setPaymentMode={setPaymentMode}
              paidAmount={paidAmount}
              setPaidAmount={setPaidAmount}
              // single program total
              calculateTotalJoinFees={() => programDetail?.joinFees || 0}
              // pass as single-item array so FeesForm still renders correctly
              programDetails={programDetail ? [programDetail] : []}
              calculateProgramPayments={(details, paid) => {
                if (!details?.length) return []
                const fees    = details[0].joinFees || 0
                const actual  = Math.min(paid, fees)
                const pending = Math.max(0, fees - actual)
                const pct     = fees > 0 ? Math.round((actual / fees) * 100) : 0
                return [{ ...details[0], paidAmount: actual, pendingAmount: pending, paymentPercentage: pct }]
              }}
            />

            <PhotoUploads
              memberPhoto={memberPhoto}     setMemberPhoto={setMemberPhoto}
              guardianPhoto={guardianPhoto} setGuardianPhoto={setGuardianPhoto}
            />

            <DocumentUploads
              memberDocFront={memberDocFront} setMemberDocFront={setMemberDocFront}
              memberDocBack={memberDocBack}   setMemberDocBack={setMemberDocBack}
              guardianDoc={guardianDoc}       setGuardianDoc={setGuardianDoc}
            />

            {/* Notification Options Section */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Notification Options</h4>
                <p className="text-xs text-gray-500 mb-3">Choose how to notify the member after registration</p>
              </div>
              <Space direction="vertical" size="middle" className="w-full">
                <Checkbox
                  checked={sendWhatsApp}
                  onChange={(e) => setSendWhatsApp(e.target.checked)}
                  disabled={loading}
                >
                  <span className="text-sm">
                    Send WhatsApp Message
                    {sendWhatsApp && <span className="text-xs text-green-600 ml-2">(Will be sent to member's mobile number)</span>}
                  </span>
                </Checkbox>
                
                <Checkbox
                  checked={sendNotification}
                  onChange={(e) => setSendNotification(e.target.checked)}
                  disabled={loading}
                >
                  <span className="text-sm">
                    Send In-App Notification
                    {sendNotification && <span className="text-xs text-blue-600 ml-2">(Member will receive notification in dashboard)</span>}
                  </span>
                </Checkbox>
              </Space>
              
              {/* Optional: Show summary if both are unchecked */}
              {!sendWhatsApp && !sendNotification && (
                <div className="mt-3 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  ⚠️ No notification method selected. Member will not receive any registration confirmation.
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={loading}>Add Member</Button>
          </div>
        </Form>
      </Spin>
    </Drawer>
  )
}

export default AddMember