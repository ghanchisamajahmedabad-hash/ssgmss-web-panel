"use client"
import { App, Button, Drawer, Form, Spin, Alert } from 'antd'
import React, { useState, useEffect } from 'react'
import { LoadingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../../../lib/firbase-client'
import isBetween from 'dayjs/plugin/isBetween'

// Import components
import BasicInfoForm from './components/BasicInfoForm'
import AddressForm from './components/AddressForm'
import GuardianForm from './components/GuardianForm'
import ProgramSelection from './components/ProgramSelection'
import AddedByForm from './components/AddedByForm'
import FeesForm from './components/FeesForm'
import PhotoUploads from './components/PhotoUploads'
import DocumentUploads from './components/DocumentUploads'
import { checkAadhaarDuplicate, handleSubmit } from './components/firebaseUtils'

dayjs.extend(isBetween)

const AddMember = ({ open, setOpen, programs, agents, currentUser ,onSuccess}) => {
  const [form] = Form.useForm()
  const {message}=App.useApp()
  const [loading, setLoading] = useState(false)
  const [selectedPrograms, setSelectedPrograms] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [addedByRole, setAddedByRole] = useState('admin')
  const [memberPhoto, setMemberPhoto] = useState(null)
  const [guardianPhoto, setGuardianPhoto] = useState(null)
  const [memberDocFront, setMemberDocFront] = useState(null)
  const [memberDocBack, setMemberDocBack] = useState(null)
  const [guardianDoc, setGuardianDoc] = useState(null)
  const [states, setStates] = useState([])
  const [districts, setDistricts] = useState([])
  const [cities, setCities] = useState([])
  const [castes, setCastes] = useState([])
  const [relations, setRelations] = useState([])
  const [selectedState, setSelectedState] = useState(null)
  const [selectedDistrict, setSelectedDistrict] = useState(null)
  const [programDetails, setProgramDetails] = useState([])
  const [joinDate, setJoinDate] = useState(dayjs())
  const [dobDate, setDobDate] = useState(null)
  const [joinFeesDone, setJoinFeesDone] = useState(false)
  const [paymentMode, setPaymentMode] = useState('cash')
  const [paidAmount, setPaidAmount] = useState(0)
  const [age, setAge] = useState(null)

  // Fetch static data on component mount
  useEffect(() => {
    fetchStaticData()
  }, [])

  useEffect(() => {
    if (dobDate && selectedPrograms.length > 0) {
      calculateProgramDetails()
    }
  }, [dobDate, joinDate, selectedPrograms])

  const fetchStaticData = async () => {
    try {
      // Fetch states
      const statesSnapshot = await getDocs(collection(db, 'states'))
      const statesData = statesSnapshot.docs
        .filter(doc => doc.data().status === 'active')
        .map(doc => ({ id: doc.id, ...doc.data() }))
      setStates(statesData)

      // Fetch castes
      const castesSnapshot = await getDocs(collection(db, 'castes'))
      const castesData = castesSnapshot.docs
        .filter(doc => doc.data().status === 'active')
        .map(doc => ({ id: doc.id, ...doc.data() }))
      setCastes(castesData)

      // Fetch relations
      const relationsSnapshot = await getDocs(collection(db, 'relations'))
      const relationsData = relationsSnapshot.docs
        .filter(doc => doc.data().status === 'active')
        .map(doc => ({ id: doc.id, ...doc.data() }))
      setRelations(relationsData)
    } catch (error) {
      console.error('Error fetching static data:', error)
      message.error('Failed to load form data')
    }
  }

  const fetchDistricts = async (stateId) => {
    try {
      const q = query(collection(db, 'districts'), where('stateId', '==', stateId))
      const snapshot = await getDocs(q)
      const districtsData = snapshot.docs
        .filter(doc => doc.data().status === 'active')
        .map(doc => ({ id: doc.id, ...doc.data() }))
      setDistricts(districtsData)
      setCities([])
      form.setFieldsValue({ district: undefined, city: undefined })
    } catch (error) {
      console.error('Error fetching districts:', error)
    }
  }

  const fetchCities = async (districtId) => {
    try {
      const q = query(collection(db, 'cities'), where('districtId', '==', districtId))
      const snapshot = await getDocs(q)
      const citiesData = snapshot.docs
        .filter(doc => doc.data().status === 'active')
        .map(doc => ({ id: doc.id, ...doc.data() }))
      setCities(citiesData)
      form.setFieldsValue({ city: undefined })
    } catch (error) {
      console.error('Error fetching cities:', error)
    }
  }

  const calculateProgramDetails = () => {
    if (!dobDate || selectedPrograms.length === 0) {
      setProgramDetails([])
      return
    }

    const calculatedAge = dayjs().diff(dobDate, 'year')
    const currentJoinDate = joinDate.format('DD-MM-YYYY')
    
    const details = selectedPrograms.map(programId => {
      const program = programs.find(p => p.id === programId)
      
      if (!program?.ageGroups) return null

      const ageGroup = program.ageGroups.find(ag => 
        calculatedAge >= ag.startAge && calculatedAge <= ag.endAge
      )

      if (!ageGroup) {
        return {
          programId,
          programName: program.name,
          error: `No age group found for age ${calculatedAge} years. Available: ${program.ageGroups.map(ag => `${ag.startAge}-${ag.endAge}`).join(', ')}`
        }
      }

      const period = ageGroup.periods?.find(p => {
        const start = dayjs(p.startDate, 'DD-MM-YYYY')
        const end = dayjs(p.endDate, 'DD-MM-YYYY')
        const join = dayjs(currentJoinDate, 'DD-MM-YYYY')
        return join.isBetween(start, end, null, '[]')
      })

      if (!period) {
        return {
          programId,
          programName: program.name,
          ageGroupName: ageGroup.ageGroupName,
          ageRange: `${ageGroup.startAge}-${ageGroup.endAge} years`,
          error: `No active period found for join date ${currentJoinDate}. Available periods: ${ageGroup.periods?.map(p => `${p.startDate} to ${p.endDate}`).join(', ')}`
        }
      }

      return {
        programId,
        programName: program.name,
        ageGroupId: ageGroup.id,
        ageGroupName: ageGroup.ageGroupName,
        ageRange: `${ageGroup.startAge}-${ageGroup.endAge} years`,
        joinFees: period.joinFees || 0,
        fixedJoinFees:period.fixedJoinFees || 0,
        payAmount: period.payAmount || 0,
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        hasPeriod: true
      }
    }).filter(detail => detail !== null)

    setProgramDetails(details)
    
    // Auto-fill paid amount with total join fees when "Yes" is selected
    if (joinFeesDone) {
      const totalJoinFees = details.reduce((sum, p) => sum + (p.joinFees || 0), 0)
      setPaidAmount(totalJoinFees)
      form.setFieldsValue({ paidAmount: totalJoinFees })
    }
  }

  const handleDobChange = (date) => {
    if (!date) {
      setDobDate(null)
      setAge(null)
      setProgramDetails([])
      return
    }
    
    const dob = date
    const today = dayjs()
    const calculatedAge = today.diff(dob, 'year')
    
    setDobDate(dob)
    setAge(calculatedAge)
    
    if (selectedPrograms.length > 0) {
      calculateProgramDetails()
    }
  }

  const handleProgramChange = (programIds) => {
    setSelectedPrograms(programIds)
    
    if (dobDate && programIds.length > 0) {
      calculateProgramDetails()
    }
  }

  const handleJoinDateChange = (date) => {
    setJoinDate(date)
    
    if (dobDate && selectedPrograms.length > 0) {
      calculateProgramDetails()
    }
  }

  const handleJoinFeesDoneChange = (e) => {
    const isDone = e.target.value
    setJoinFeesDone(isDone)
    
    // Auto-fill with total join fees when "Yes" is selected
    if (isDone) {
      const totalJoinFees = programDetails.reduce((sum, p) => sum + (p.joinFees || 0), 0)
      setPaidAmount(totalJoinFees)
      form.setFieldsValue({ paidAmount: totalJoinFees })
    } else {
      setPaidAmount(0)
      form.setFieldsValue({ paidAmount: 0 })
    }
  }

  const calculateTotalJoinFees = () => {
    return programDetails.reduce((sum, p) => sum + (p.joinFees || 0), 0)
  }

  const onFormSubmit = async (values) => {
    const success = await handleSubmit(
      values,
      {
        selectedPrograms,
        programDetails,
        programs,
        states,
        districts,
        cities,
        castes,
        relations,
        addedByRole,
        selectedAgent,
        joinDate,
        dobDate,
        age,
        joinFeesDone,
        paymentMode,
        paidAmount,
        memberPhoto,
        guardianPhoto,
        memberDocFront,
        memberDocBack,
        guardianDoc,
        currentUser,
        form,
        setOpen,
        setLoading
      },
      message
    )

    if (success) {
      onSuccess()
      setSelectedPrograms([])
      setProgramDetails([])
      setMemberPhoto(null)
      setGuardianPhoto(null)
      setMemberDocFront(null)
      setMemberDocBack(null)
      setGuardianDoc(null)
      setSelectedState(null)
      setSelectedDistrict(null)
      setCities([])
      setDobDate(null)
      setAge(null)
      setJoinFeesDone(false)
      setPaymentMode('cash')
      setPaidAmount(0)
      form.resetFields()
    }
  }

  const handleStateChange = (value) => {
    setSelectedState(value)
    if (value) {
      fetchDistricts(value)
    } else {
      setDistricts([])
      setCities([])
      form.setFieldsValue({ district: undefined, city: undefined })
    }
  }

  const handleDistrictChange = (value) => {
    setSelectedDistrict(value)
    if (value) {
      fetchCities(value)
    } else {
      setCities([])
      form.setFieldsValue({ city: undefined })
    }
  }

const calculateProgramPayments = (programDetails, paidAmount) => {
  if (!programDetails || programDetails.length === 0) {
    return []
  }
  
  // Program को priority order में sort करें (या original order maintain करें)
  const programs = [...programDetails]
  let remainingAmount = paidAmount
  
  const result = programs.map(p => {
    const programFees = p.joinFees || 0
    
    if (remainingAmount <= 0) {
      // No money left for this program
      return {
        programId: p.programId,
        programName: p.programName,
        joinFees: programFees,
        paidAmount: 0,
        pendingAmount: programFees,
        paymentPercentage: 0
      }
    } else if (remainingAmount >= programFees) {
      // Full payment for this program
      const programPaidAmount = programFees
      remainingAmount -= programPaidAmount
      
      return {
        programId: p.programId,
        programName: p.programName,
        joinFees: programFees,
        paidAmount: programPaidAmount,
        pendingAmount: 0,
        paymentPercentage: 100
      }
    } else {
      // Partial payment for this program
      const programPaidAmount = remainingAmount
      remainingAmount = 0
      
      return {
        programId: p.programId,
        programName: p.programName,
        joinFees: programFees,
        paidAmount: programPaidAmount,
        pendingAmount: programFees - programPaidAmount,
        paymentPercentage: Math.round((programPaidAmount / programFees) * 100)
      }
    }
  })
  
  return result
}

  const handleAadhaarCheck = async (aadhaarNumber) => {
    try {
      // आपका Firebase function यहाँ call करें
      return await checkAadhaarDuplicate(aadhaarNumber)
    } catch (error) {
      console.error('Error checking Aadhaar:', error)
      return null
    }
  }
  return (
    <Drawer
      title="Add New Member"
      open={open}
      onClose={() => !loading && setOpen(false)}
      size={1000}
      footer={null}
      maskClosable={!loading}
      closable={!loading}
    >
      <Spin spinning={loading} indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFormSubmit}
          initialValues={{
            joinFeesDone: false,
            addedBy: 'admin',
            joinDate: dayjs()
          }}
          disabled={loading}
        >
          <div className='flex flex-col gap-2'>
           <BasicInfoForm 
              handleDobChange={handleDobChange}
              age={age}
              castes={castes}
              form={form}
              onAadhaarCheck={handleAadhaarCheck}  // यहाँ pass करें
            />

            <AddressForm 
              states={states}
              districts={districts}
              cities={cities}
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
              handleStateChange={handleStateChange}
              handleDistrictChange={handleDistrictChange}
              form={form}
            />

            <GuardianForm relations={relations} />

            <ProgramSelection 
              joinDate={joinDate}
              handleJoinDateChange={handleJoinDateChange}
              programs={programs}
              selectedPrograms={selectedPrograms}
              handleProgramChange={handleProgramChange}
              dobDate={dobDate}
              programDetails={programDetails}
              calculateTotalJoinFees={calculateTotalJoinFees}
            />

            <AddedByForm 
              addedByRole={addedByRole}
              setAddedByRole={setAddedByRole}
              agents={agents}
              selectedAgent={selectedAgent}
              setSelectedAgent={setSelectedAgent}
            />

            <FeesForm 
              joinFeesDone={joinFeesDone}
              handleJoinFeesDoneChange={handleJoinFeesDoneChange}
              paymentMode={paymentMode}
              setPaymentMode={setPaymentMode}
              paidAmount={paidAmount}
              setPaidAmount={setPaidAmount}
              calculateTotalJoinFees={calculateTotalJoinFees}
              programDetails={programDetails}
              calculateProgramPayments={calculateProgramPayments}
            />

            <PhotoUploads 
              memberPhoto={memberPhoto}
              setMemberPhoto={setMemberPhoto}
              guardianPhoto={guardianPhoto}
              setGuardianPhoto={setGuardianPhoto}
            />

            <DocumentUploads 
              memberDocFront={memberDocFront}
              setMemberDocFront={setMemberDocFront}
              memberDocBack={memberDocBack}
              setMemberDocBack={setMemberDocBack}
              guardianDoc={guardianDoc}
              setGuardianDoc={setGuardianDoc}
            />
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              Add Member
            </Button>
          </div>
        </Form>
      </Spin>
    </Drawer>
  )
}

export default AddMember