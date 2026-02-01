"use client"
import { App, Button, Drawer, Form, Spin } from 'antd'
import React, { useState, useEffect, useCallback } from 'react'
import { LoadingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useSelector } from 'react-redux'
import { 
  collection, getDocs, query, where, doc, getDoc, 
  updateDoc, serverTimestamp, addDoc 
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../../lib/firbase-client'
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

dayjs.extend(isBetween)

// Helper functions
const uploadFile = async (file, folder, fileName) => {
  if (!file) return null
  const storageRef = ref(storage, `${folder}/${Date.now()}_${fileName}`)
  const snapshot = await uploadBytes(storageRef, file)
  return await getDownloadURL(snapshot.ref)
}

const calculateProgramPayments = (programDetails, paidAmount) => {
  const totalJoinFees = programDetails?.reduce((sum, p) => sum + (p.joinFees || 0), 0) || 0
  
  if (!totalJoinFees || totalJoinFees === 0) {
    return programDetails?.map(p => ({
      programId: p.programId,
      programName: p.programName,
      joinFees: p.joinFees || 0,
      paidAmount: 0,
      pendingAmount: p.joinFees || 0,
      paymentPercentage: 0
    })) || []
  }
  
  if (paidAmount >= totalJoinFees) {
    // Full payment
    return programDetails?.map(p => ({
      programId: p.programId,
      programName: p.programName,
      joinFees: p.joinFees,
      paidAmount: p.joinFees,
      pendingAmount: 0,
      paymentPercentage: 100
    }))
  } else {
    // Partial payment - distribute proportionally
    return programDetails?.map(p => {
      const proportion = p.joinFees / totalJoinFees
      const programPaidAmount = Math.round(paidAmount * proportion)
      const pendingAmount = Math.max(0, p.joinFees - programPaidAmount)
      const paymentPercentage = p.joinFees > 0 ? 
        Math.round((programPaidAmount / p.joinFees) * 100) : 0
      
      return {
        programId: p.programId,
        programName: p.programName,
        joinFees: p.joinFees,
        paidAmount: programPaidAmount,
        pendingAmount: pendingAmount,
        paymentPercentage: paymentPercentage
      }
    })
  }
}

const EditMember = ({ open, setOpen, programs, agents, currentUser, memberId, onSuccess }) => {
  const [form] = Form.useForm()
  const {message}=App.useApp()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
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
  const [memberData, setMemberData] = useState(null)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [initialPaidAmount, setInitialPaidAmount] = useState(0)
  const [additionalPayment, setAdditionalPayment] = useState(0)
  const [memberProgramsData, setMemberProgramsData] = useState([])

  // Fetch static data
  useEffect(() => {
    fetchStaticData()
  }, [])

  // Fetch member data when opened
  useEffect(() => {
    if (open && memberId) {
      resetForm()
      fetchMemberData()
    }
  }, [open, memberId])

  // Recalculate when dependencies change
  useEffect(() => {
    if (dataLoaded && dobDate && selectedPrograms.length > 0 && programs.length > 0) {
      calculateProgramDetails()
    }
  }, [dataLoaded, dobDate, joinDate, selectedPrograms, programs])

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

const fetchMemberData = async () => {
  if (!memberId) return
  
  setFetching(true)
  setDataLoaded(false)
  try {
    // Fetch member document
    const memberRef = doc(db, 'members', memberId)
    const memberSnap = await getDoc(memberRef)
    
    if (memberSnap.exists()) {
      const data = memberSnap.data()
      setMemberData({ id: memberSnap.id, ...data })
      console.log('Fetched member data:', data)
      
      // Parse dates - FIX: Use dobDate instead of bobDate
      const dob = data.dobDate ? dayjs(data.dobDate, 'DD-MM-YYYY') : null
      const join = data.dateJoin ? dayjs(data.dateJoin, 'DD-MM-YYYY') : dayjs()
      console.log('Parsed dates - dob:', dob, 'join:', join)
      
      // Set state values
      setDobDate(dob)
      setJoinDate(join)
      setAge(data.age || null)
      setSelectedPrograms(data.programIds || [])
      setJoinFeesDone(data.joinFeesDone || false)
      setPaymentMode(data.paymentMode || 'cash')
      setPaidAmount(data.paidAmount || 0)
      setInitialPaidAmount(data.paidAmount || 0)
      setAddedByRole(data.addedBy || 'admin')
      setSelectedAgent(data.agentId || null)
      
      // Calculate age if dob exists
      if (dob) {
        const calculatedAge = dayjs().diff(dob, 'year')
        setAge(calculatedAge)
        console.log('Calculated age:', calculatedAge)
      }
      
      // Fetch member programs data
      await fetchMemberPrograms(memberSnap.id)
      
      // Set form fields - FIX: Use dobDate field name
      form.setFieldsValue({
        name: data.displayName,
        fatherName: data.fatherName,
        surname: data.surname,
        caste: data.casteId,
        religion: data.religion,
        phone: data.phone,
        phoneAlt: data.phoneAlt || '',
        bobDate: dob, // This is the form field name
        currentAddress: data.currentAddress,
        state: data.stateId,
        district: data.districtId,
        city: data.cityId,
        pinCode: data.pinCode,
        village: data.village,
        aadhaarNo: data.aadhaarNo,
        guardian: data.guardian,
        guardianRelation: data.guardianRelationId,
        joinDate: join,
        programs: data.programIds,
        addedBy: data.addedBy || 'admin',
        selectedAgent: data.agentId,
        password: '',
        joinFeesDone: data.joinFeesDone || false,
        paymentMode: data.paymentMode || 'cash',
        paidAmount: data.paidAmount || 0,
        joinFeesTxtId: data.joinFeesTxtId || '',
        transactionDate: data.transactionDate ? dayjs(data.transactionDate, 'DD-MM-YYYY') : null
      })
      
      // Set state and fetch districts/cities
      if (data.stateId) {
        setSelectedState(data.stateId)
        await fetchDistricts(data.stateId, data.districtId)
      }
      
      // Mark data as loaded
      setDataLoaded(true)
      
    } else {
      message.error('Member not found')
      setOpen(false)
    }
  } catch (error) {
    console.error('Error fetching member data:', error)
    message.error('Failed to load member data')
  } finally {
    setFetching(false)
  }
}
  const fetchMemberPrograms = async (memberId) => {
    try {
      const programsRef = collection(db, 'members', memberId, 'memberPrograms')
      const snapshot = await getDocs(programsRef)
      const programsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setMemberProgramsData(programsData)
    } catch (error) {
      console.error('Error fetching member programs:', error)
    }
  }

  const fetchDistricts = async (stateId, selectDistrictId = null) => {
    try {
      const q = query(collection(db, 'districts'), where('stateId', '==', stateId))
      const snapshot = await getDocs(q)
      const districtsData = snapshot.docs
        .filter(doc => doc.data().status === 'active')
        .map(doc => ({ id: doc.id, ...doc.data() }))
      setDistricts(districtsData)
      
      if (selectDistrictId) {
        await fetchCities(selectDistrictId)
      }
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
    } catch (error) {
      console.error('Error fetching cities:', error)
    }
  }

  const calculateProgramDetails = useCallback(() => {
    if (!dobDate || selectedPrograms.length === 0 || programs.length === 0) {
      setProgramDetails([])
      return
    }

    const calculatedAge = dayjs().diff(dobDate, 'year')
    const currentJoinDate = joinDate.format('DD-MM-YYYY')
    
    const details = selectedPrograms.map(programId => {
      const program = programs.find(p => p.id === programId)
      
      if (!program) return null
      
      if (!program?.ageGroups || program.ageGroups.length === 0) {
        return {
          programId,
          programName: program.name,
          error: `No age groups configured`
        }
      }

      const ageGroup = program.ageGroups.find(ag => 
        calculatedAge >= ag.startAge && calculatedAge <= ag.endAge
      )

      if (!ageGroup) {
        return {
          programId,
          programName: program.name,
          error: `No age group found for age ${calculatedAge}`
        }
      }

      const period = ageGroup.periods?.find(p => {
        try {
          const start = dayjs(p.startDate, 'DD-MM-YYYY')
          const end = dayjs(p.endDate, 'DD-MM-YYYY')
          const join = dayjs(currentJoinDate, 'DD-MM-YYYY')
          return join.isBetween(start, end, null, '[]')
        } catch (error) {
          return false
        }
      })

      if (!period) {
        return {
          programId,
          programName: program.name,
          ageGroupName: ageGroup.ageGroupName,
          error: `No active period found for join date ${currentJoinDate}`
        }
      }

      return {
        programId,
        programName: program.name,
        ageGroupId: ageGroup.id,
        ageGroupName: ageGroup.ageGroupName,
        joinFees: period.joinFees || 0,
        payAmount: period.payAmount || 0,
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        hasPeriod: true
      }
    }).filter(detail => detail !== null)

    setProgramDetails(details)
    
    // Update paid amount if it's zero or less than calculated fees
    const totalJoinFees = details.reduce((sum, p) => sum + (p.joinFees || 0), 0)
    if ((!paidAmount || paidAmount === 0) && totalJoinFees > 0) {
      setPaidAmount(totalJoinFees)
      form.setFieldsValue({ paidAmount: totalJoinFees })
    }
  }, [dobDate, selectedPrograms, joinDate, programs, form, paidAmount])

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
    
    setTimeout(() => {
      if (selectedPrograms.length > 0) {
        calculateProgramDetails()
      }
    }, 100)
  }

  const handleProgramChange = (programIds) => {
    setSelectedPrograms(programIds)
    
    setTimeout(() => {
      if (dobDate && programIds.length > 0) {
        calculateProgramDetails()
      }
    }, 100)
  }

  const handleJoinDateChange = (date) => {
    setJoinDate(date)
    
    setTimeout(() => {
      if (dobDate && selectedPrograms.length > 0) {
        calculateProgramDetails()
      }
    }, 100)
  }

  const handleJoinFeesDoneChange = (e) => {
    const isDone = e.target.value
    setJoinFeesDone(isDone)
    
    if (isDone && (!paidAmount || paidAmount === 0)) {
      const totalJoinFees = calculateTotalJoinFees()
      setPaidAmount(totalJoinFees)
      form.setFieldsValue({ paidAmount: totalJoinFees })
    }
  }

  const calculateTotalJoinFees = () => {
    return programDetails.reduce((sum, p) => sum + (p.joinFees || 0), 0)
  }
const recordPaymentTransaction = async (
  memberId, 
  memberName, 
  registrationNumber, 
  changeAmount,
  newTotalPaid,
  newPendingAmount,
  paymentMode, 
  transactionId, 
  transactionDate,
  notes,
  userId
) => {
  try {
    const transactionType = changeAmount > 0 ? 'additional_payment' : 
                          changeAmount < 0 ? 'refund_adjustment' : 'payment_update'
    
    const transactionData = {
      memberId,
      memberName,
      registrationNumber,
      transactionType,
      changeAmount: parseFloat(Math.abs(changeAmount)),
      newTotalPaid: parseFloat(newTotalPaid),
      newPendingAmount: parseFloat(newPendingAmount),
      paymentMode,
      transactionId: transactionId || '',
      transactionDate: transactionDate ? dayjs(transactionDate).format('DD-MM-YYYY') : dayjs().format('DD-MM-YYYY'),
      transactionDateTime: serverTimestamp(), // This will store exact timestamp
      status: 'completed',
      verified: true,
      notes: notes || `Payment ${changeAmount > 0 ? 'increased' : 'decreased'} via member edit`,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updated_at: serverTimestamp(),
      
      // Searchable fields
      search_memberName: memberName?.toLowerCase() || '',
      search_registrationNumber: registrationNumber || '',
      search_transactionType: transactionType,
      search_date: dayjs().format('YYYY-MM-DD')
    }

    const transactionRef = await addDoc(collection(db, 'memberJoinFees'), transactionData)
    
    message.info(`New ${transactionType.replace('_', ' ')} transaction recorded (ID: ${transactionRef.id})`)
    return transactionRef.id
    
  } catch (error) {
    console.error('Error recording payment transaction:', error)
    message.warning('Payment was updated but transaction recording failed')
    return null
  }
}
  const handleUpdateMember = async (values) => {
    setLoading(true)
    
    try {
      // Validate program details
      const hasErrors = programDetails.some(p => p.error)
      if (hasErrors) {
        message.error('Please fix program selection errors before submitting')
        setLoading(false)
        return false
      }

      // Calculate total join fees
      const totalJoinFees = calculateTotalJoinFees()
      const currentPaidAmount = parseFloat(paidAmount || 0)
      const totalPendingAmount = Math.max(0, totalJoinFees - currentPaidAmount)
      const overallPaymentPercentage = totalJoinFees > 0 ? 
        Math.round((currentPaidAmount / totalJoinFees) * 100) : 0

      // Check if additional payment was made
      const paymentDifference = currentPaidAmount - initialPaidAmount
      const hasAdditionalPayment = paymentDifference > 0

      // Upload new files if provided
      const fileUrls = await uploadFiles(values)

      // Get selected names
      const selectedStateName = states.find(s => s.id === values.state)?.name || memberData?.state || ''
      const selectedDistrictName = districts.find(d => d.id === values.district)?.name || memberData?.district || ''
      const selectedCityName = cities.find(c => c.id === values.city)?.name || memberData?.city || ''
      const selectedCasteName = castes.find(c => c.id === values.caste)?.name || memberData?.caste || ''
      const selectedRelationName = relations.find(r => r.id === values.guardianRelation)?.name || memberData?.guardianRelation || ''

      // Calculate program-wise payments
      const programPayments = calculateProgramPayments(programDetails, currentPaidAmount)

      // Prepare update data
      const updateData = {
        displayName: values.name,
        fatherName: values.fatherName,
        surname: values.surname,
        caste: selectedCasteName,
        casteId: values.caste,
        religion: values.religion,
        phone: values.phone,
        phoneAlt: values.phoneAlt || '',
        dateJoin: joinDate.format('DD-MM-YYYY'),
        bobDate: dobDate?.format('DD-MM-YYYY') || '',
        age: age,
        currentAddress: values.currentAddress,
        state: selectedStateName,
        stateId: values.state,
        district: selectedDistrictName,
        districtId: values.district,
        city: selectedCityName,
        cityId: values.city,
        pinCode: values.pinCode,
        village: values.village,
        aadhaarNo: values.aadhaarNo,
        guardian: values.guardian,
        guardianRelation: selectedRelationName,
        guardianRelationId: values.guardianRelation,
        
        // Added by information
        addedBy: addedByRole,
        agentId: addedByRole === 'agent' ? selectedAgent : null,
        
        // File URLs - only update if new files were uploaded
        ...(fileUrls.photoURL && { photoURL: fileUrls.photoURL }),
        ...(fileUrls.guardianPhotoURL && { guardianPhotoURL: fileUrls.guardianPhotoURL }),
        ...(fileUrls.documentFrontURL && { documentFrontURL: fileUrls.documentFrontURL }),
        ...(fileUrls.documentBackURL && { documentBackURL: fileUrls.documentBackURL }),
        ...(fileUrls.guardianDocumentURL && { guardianDocumentURL: fileUrls.guardianDocumentURL }),
        
        // Financial fields
        joinFees: totalJoinFees,
        joinFeesDone: joinFeesDone,
        paymentMode: joinFeesDone ? paymentMode : null,
        paidAmount: currentPaidAmount,
        pendingAmount: totalPendingAmount,
        paymentPercentage: overallPaymentPercentage,
        joinFeesTxtId: values.joinFeesTxtId || '',
        transactionDate: values.transactionDate ? values.transactionDate.format('DD-MM-YYYY') : null,
        
        // Program fields
        programIds: selectedPrograms,
        
        // Program payment summary
        programPaymentSummary: {
          totalPrograms: selectedPrograms.length,
          fullyPaidPrograms: programPayments.filter(p => p.paymentPercentage === 100).length,
          partiallyPaidPrograms: programPayments.filter(p => p.paymentPercentage > 0 && p.paymentPercentage < 100).length,
          pendingPrograms: programPayments.filter(p => p.paymentPercentage === 0).length
        },
        
        // Searchable fields
        search_name: values.name?.toLowerCase() || '',
        search_fatherName: values.fatherName?.toLowerCase() || '',
        search_surname: values.surname?.toLowerCase() || '',
        search_fullName: `${values.name} ${values.fatherName} ${values.surname}`.toLowerCase().trim(),
        search_phone: values.phone || '',
        search_phoneLast4: values.phone?.slice(-4) || '',
        search_aadhaar: values.aadhaarNo || '',
        search_aadhaarLast4: values.aadhaarNo?.slice(-4) || '',
        search_village: values.village?.toLowerCase() || '',
        search_city: selectedCityName?.toLowerCase() || '',
        search_district: selectedDistrictName?.toLowerCase() || '',
        search_state: selectedStateName?.toLowerCase() || '',
        search_caste: selectedCasteName?.toLowerCase() || '',
        search_guardian: values.guardian?.toLowerCase() || '',
        
        // Status flags
        hasPendingPayments: totalPendingAmount > 0,
        
        // Timestamps
        updated_at: serverTimestamp()
      }

      // Update password if provided
      if (values.password && values.password.trim() !== '') {
        updateData.password = values.password
      }

      // Update member document
      const memberRef = doc(db, 'members', memberId)
      await updateDoc(memberRef, updateData)

      // Record additional payment if any
 // Record NEW transaction if payment changed
    if (hasPaymentChange && joinFeesDone) {
      await recordPaymentTransaction(
        memberId,
        values.name || memberData?.displayName || '',
        memberData?.registrationNumber || '',
        paymentDifference,
        currentPaidAmount,
        totalPendingAmount,
        paymentMode,
        values.joinFeesTxtId,
        values.transactionDate || dayjs(),
        values.paymentNotes || 'Payment updated via member edit',
        currentUser?.uid
      )
    }

      // Update member programs
      await updateMemberPrograms(memberId, selectedPrograms, programPayments)

      message.success('Member updated successfully!')
      
      if (onSuccess) {
        onSuccess()
      }
      
      setOpen(false)
      return true
      
    } catch (error) {
      console.error('Error updating member:', error)
      message.error('Failed to update member: ' + error.message)
      return false
    } finally {
      setLoading(false)
    }
  }

  const uploadFiles = async (values) => {
    const uploadPromises = []
    const results = {
      photoURL: null,
      guardianPhotoURL: null,
      documentFrontURL: null,
      documentBackURL: null,
      guardianDocumentURL: null
    }

    if (memberPhoto) {
      uploadPromises.push(
        uploadFile(memberPhoto, 'members/photos', `${values.name}_photo`).then(url => {
          results.photoURL = url
        })
      )
    }
    
    if (guardianPhoto) {
      uploadPromises.push(
        uploadFile(guardianPhoto, 'members/guardian_photos', `${values.guardian}_photo`).then(url => {
          results.guardianPhotoURL = url
        })
      )
    }
    
    if (memberDocFront) {
      uploadPromises.push(
        uploadFile(memberDocFront, 'members/documents', `${values.name}_doc_front`).then(url => {
          results.documentFrontURL = url
        })
      )
    }
    
    if (memberDocBack) {
      uploadPromises.push(
        uploadFile(memberDocBack, 'members/documents', `${values.name}_doc_back`).then(url => {
          results.documentBackURL = url
        })
      )
    }
    
    if (guardianDoc) {
      uploadPromises.push(
        uploadFile(guardianDoc, 'members/guardian_documents', `${values.guardian}_doc`).then(url => {
          results.guardianDocumentURL = url
        })
      )
    }

    await Promise.allSettled(uploadPromises)
    return results
  }

  const recordAdditionalPayment = async (
    memberId, 
    memberName, 
    registrationNumber, 
    amount, 
    paymentMode, 
    transactionId, 
    transactionDate,
    userId
  ) => {
    try {
      const transactionData = {
        memberId,
        memberName,
        registrationNumber,
        transactionType: 'additional_payment',
        amount: parseFloat(amount),
        paymentMode,
        transactionId: transactionId || '',
        transactionDate: transactionDate ? transactionDate.format('DD-MM-YYYY') : dayjs().format('DD-MM-YYYY'),
        status: 'completed',
        verified: true,
        notes: 'Payment updated via member edit',
        createdBy: userId,
        createdAt: serverTimestamp(),
        updated_at: serverTimestamp()
      }

      await addDoc(collection(db, 'memberJoinFees'), transactionData)
      message.info(`Additional payment of ₹${amount} recorded`)
    } catch (error) {
      console.error('Error recording additional payment:', error)
      // Don't fail the entire update if payment recording fails
    }
  }

  const updateMemberPrograms = async (memberId, selectedPrograms, programPayments) => {
    try {
      const memberProgramsRef = collection(db, 'members', memberId, 'memberPrograms')
      const querySnapshot = await getDocs(memberProgramsRef)
      
      // Update existing programs
      const existingPrograms = new Map()
      querySnapshot.docs.forEach(docSnap => {
        const data = docSnap.data()
        existingPrograms.set(data.programId, { ref: docSnap.ref, data })
      })
      
      for (const programId of selectedPrograms) {
        const programDetail = programDetails.find(p => p.programId === programId)
        const programPayment = programPayments.find(p => p.programId === programId)
        const program = programs.find(p => p.id === programId)
        
        if (programDetail && !programDetail.error) {
          const programData = {
            programId,
            programName: programDetail.programName,
            ageGroupId: programDetail.ageGroupId,
            ageGroupName: programDetail.ageGroupName,
            joinFees: programDetail.joinFees || 0,
            payAmount: programDetail.payAmount || 0,
            paidAmount: programPayment?.paidAmount || 0,
            pendingAmount: programPayment?.pendingAmount || programDetail.joinFees || 0,
            paymentPercentage: programPayment?.paymentPercentage || 0,
            paymentStatus: programPayment?.paymentPercentage === 100 ? 'paid' : 
                          (programPayment?.paymentPercentage > 0 ? 'partial' : 'pending'),
            joinDate: joinDate.format('DD-MM-YYYY'),
            periodStartDate: programDetail.periodStartDate,
            periodEndDate: programDetail.periodEndDate,
            status: 'active',
            memberGroupId: program?.memberGroups?.[0]?.id,
            memberGroupName: program?.memberGroups?.[0]?.groupName,
            memberGroupCode: program?.memberGroups?.[0]?.code,
            updated_at: serverTimestamp()
          }
          
          if (existingPrograms.has(programId)) {
            // Update existing program
            const existing = existingPrograms.get(programId)
            await updateDoc(existing.ref, programData)
          } else {
            // Add new program
            await addDoc(memberProgramsRef, {
              ...programData,
              addedDate: serverTimestamp(),
              createdBy: currentUser?.uid
            })
          }
        }
      }
      
      // Deactivate programs that were removed
      for (const [programId, programData] of existingPrograms.entries()) {
        if (!selectedPrograms.includes(programId)) {
          await updateDoc(programData.ref, {
            status: 'inactive',
            updated_at: serverTimestamp()
          })
        }
      }
    } catch (error) {
      console.error('Error updating member programs:', error)
      // Continue even if program update fails
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

  const resetForm = () => {
    form.resetFields()
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
    setInitialPaidAmount(0)
    setAdditionalPayment(0)
    setAddedByRole('admin')
    setSelectedAgent(null)
    setMemberData(null)
    setMemberProgramsData([])
    setDataLoaded(false)
  }

  return (
    <Drawer
      title="Edit Member"
      open={open}
      onClose={() => {
        if (!loading && !fetching) {
          resetForm()
          setOpen(false)
        }
      }}
      size={900}
      footer={null}
      maskClosable={!loading && !fetching}
      closable={!loading && !fetching}
    >
      <Spin spinning={loading || fetching} indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleUpdateMember}
          disabled={loading || fetching}
        >
          <div className='flex flex-col gap-2'>
            <BasicInfoForm 
              handleDobChange={handleDobChange}
              age={age}
              castes={castes}
              form={form}
              isEditMode={true}
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
              isEditMode={true}
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
  calculateProgramPayments={(details, amount) => calculateProgramPayments(details, amount)}
  isEditMode={true}
  initialPaidAmount={initialPaidAmount}
  memberId={memberId}
  registrationNumber={memberData?.registrationNumber || ''}
  memberName={memberData?.displayName || ''}
  currentUser={currentUser}
/>

            <PhotoUploads 
              memberPhoto={memberPhoto}
              setMemberPhoto={setMemberPhoto}
              guardianPhoto={guardianPhoto}
              setGuardianPhoto={setGuardianPhoto}
              existingMemberPhoto={memberData?.photoURL}
              existingGuardianPhoto={memberData?.guardianPhotoURL}
              isEditMode={true}
            />

            <DocumentUploads 
              memberDocFront={memberDocFront}
              setMemberDocFront={setMemberDocFront}
              memberDocBack={memberDocBack}
              setMemberDocBack={setMemberDocBack}
              guardianDoc={guardianDoc}
              setGuardianDoc={setGuardianDoc}
              existingMemberDocFront={memberData?.documentFrontURL}
              existingMemberDocBack={memberData?.documentBackURL}
              existingGuardianDoc={memberData?.guardianDocumentURL}
              isEditMode={true}
            />
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button 
              onClick={() => {
                resetForm()
                setOpen(false)
              }} 
              disabled={loading || fetching}
            >
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              Update Member
            </Button>
          </div>
        </Form>
      </Spin>
    </Drawer>
  )
}

export default EditMember