import { 
  collection, addDoc, serverTimestamp, query, where, getDocs, 
  getDoc, doc, updateDoc, deleteDoc 
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import dayjs from 'dayjs'
import { db, storage } from '../../../../../lib/firbase-client'
import { message } from 'antd'

// File upload utility
export const uploadFile = async (file, folder, fileName) => {
  if (!file) return ''
  
  // If it's already a URL, return it
  if (typeof file === 'string' && file.startsWith('http')) {
    return file
  }
  
  // If it's not a File object, return empty
  if (!(file instanceof File)) {
    console.warn('uploadFile called with non-File object:', file)
    return ''
  }

  try {
    const timestamp = Date.now()
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
    const storageRef = ref(storage, `${folder}/${timestamp}_${sanitizedFileName}`)
    const snapshot = await uploadBytes(storageRef, file)
    const downloadURL = await getDownloadURL(snapshot.ref)
    return downloadURL
  } catch (error) {
    console.error('Error uploading file:', error)
    throw error
  }
}
// Upload multiple files
export const uploadAllFiles = async (files) => {
  const uploadPromises = []
  
  if (files.memberPhoto) {
    uploadPromises.push(uploadFile(
      files.memberPhoto, 
      'members/photos', 
      `${files.memberName || 'member'}_photo`
    ))
  }
  
  if (files.guardianPhoto) {
    uploadPromises.push(uploadFile(
      files.guardianPhoto, 
      'members/guardian_photos', 
      `${files.guardianName || 'guardian'}_photo`
    ))
  }
  
  if (files.memberDocFront) {
    uploadPromises.push(uploadFile(
      files.memberDocFront, 
      'members/documents', 
      `${files.memberName || 'member'}_doc_front`
    ))
  }
  
  if (files.memberDocBack) {
    uploadPromises.push(uploadFile(
      files.memberDocBack, 
      'members/documents', 
      `${files.memberName || 'member'}_doc_back`
    ))
  }
  
  if (files.guardianDoc) {
    uploadPromises.push(uploadFile(
      files.guardianDoc, 
      'members/guardian_documents', 
      `${files.guardianName || 'guardian'}_doc`
    ))
  }
  
  const results = await Promise.allSettled(uploadPromises)
  
  return {
    photoURL: results[0]?.status === 'fulfilled' ? results[0].value : '',
    guardianPhotoURL: results[1]?.status === 'fulfilled' ? results[1].value : '',
    documentFrontURL: results[2]?.status === 'fulfilled' ? results[2].value : '',
    documentBackURL: results[3]?.status === 'fulfilled' ? results[3].value : '',
    guardianDocumentURL: results[4]?.status === 'fulfilled' ? results[4].value : ''
  }
}

// Generate registration number
export const generateRegistrationNumber = async () => {
  try {
    const year = dayjs().format('YYYY')
    const month = dayjs().format('MM')
    const prefix = 'MEM'
    
    // Count members for current month
    const startDate = `01-${month}-${year}`
    const endDate = `31-${month}-${year}`
    
    const q = query(
      collection(db, 'members'),
      where('dateJoin', '>=', startDate),
      where('dateJoin', '<=', endDate)
    )
    
    const snapshot = await getDocs(q)
    const count = snapshot.size + 1
    
    return `${prefix}${year}${month}${count.toString().padStart(4, '0')}`
  } catch (error) {
    console.error('Error generating registration number:', error)
    // Fallback with timestamp
    return `MEM${dayjs().format('YYYYMMDDHHmmss')}`
  }
}

// Create search index using your function
export function createSearchIndex(data) {
  const indexSet = new Set();

  const addPrefixes = (text) => {
    const str = String(text).toLowerCase().trim();
    if (!str) return;

    // Add full text
    indexSet.add(str);
    
    // Add words split
    str.split(/\s+/).forEach(word => {
      if (word.length > 1) {
        indexSet.add(word);
        
        // Add prefixes for each word
        let prefix = "";
        for (const ch of word) {
          prefix += ch;
          if (prefix.length > 1) { // Skip single character prefixes
            indexSet.add(prefix);
          }
        }
      }
    });
  };

  const traverse = (value) => {
    if (value === null || value === undefined) return;

    if (typeof value === "object") {
      if (Array.isArray(value)) {
        value.forEach(v => traverse(v));
      } else {
        Object.values(value).forEach(v => traverse(v));
      }
    } else {
      addPrefixes(value);
    }
  };

  traverse(data);

  return Array.from(indexSet).filter(item => item.length > 0);
}

// Record join fee transaction in separate collection
export const recordJoinFeeTransaction = async (memberData, paymentData) => {
  try {
    const transactionRef = await addDoc(collection(db, 'memberJoinFees'), {
      // Member information
      memberId: memberData.memberId,
      memberName: memberData.displayName,
      registrationNumber: memberData.registrationNumber,
      memberPhone: memberData.phone,
      
      // Transaction details
      transactionType: paymentData.transactionType || 'join_fee',
      amount: parseFloat(paymentData.paidAmount || 0),
      previousBalance: paymentData.previousBalance || 0,
      newBalance: parseFloat(paymentData.totalPendingAmount || 0),
      
      // Payment method
      paymentMode: paymentData.paymentMode,
      transactionId: paymentData.transactionId || '',
      transactionDate: paymentData.transactionDate 
        ? dayjs(paymentData.transactionDate).format('DD-MM-YYYY')
        : dayjs().format('DD-MM-YYYY'),
      
      // Program association
      programIds: paymentData.programIds || [],
      programNames: paymentData.programNames || [],
      
      // Status
      status: 'completed',
      verified: true,
      notes: paymentData.notes || 'Initial join fee payment',
      
      // Metadata
      createdBy: memberData.createdBy,
      createdAt: serverTimestamp(),
      updated_at: serverTimestamp(),
      
      // Searchable fields
      search_memberName: memberData.displayName?.toLowerCase() || '',
      search_registrationNumber: memberData.registrationNumber || '',
      search_transactionId: paymentData.transactionId?.toLowerCase() || '',
      search_paymentMode: paymentData.paymentMode?.toLowerCase() || '',
      search_date: dayjs().format('YYYY-MM-DD')
    });
    
    return transactionRef.id;
  } catch (error) {
    console.error('Error recording transaction:', error)
    throw error
  }
}

// Create compound search strings for better indexing
const createCompoundSearchStrings = (memberData) => {
  const compounds = []
  
  // Name combinations
  if (memberData.displayName && memberData.fatherName) {
    compounds.push(`${memberData.displayName} ${memberData.fatherName}`.toLowerCase())
    compounds.push(`${memberData.fatherName} ${memberData.displayName}`.toLowerCase())
  }
  
  if (memberData.displayName && memberData.surname) {
    compounds.push(`${memberData.displayName} ${memberData.surname}`.toLowerCase())
  }
  
  if (memberData.displayName && memberData.fatherName && memberData.surname) {
    compounds.push(`${memberData.displayName} ${memberData.fatherName} ${memberData.surname}`.toLowerCase())
  }
  
  // Address combinations
  if (memberData.village && memberData.city) {
    compounds.push(`${memberData.village} ${memberData.city}`.toLowerCase())
  }
  
  if (memberData.village && memberData.district) {
    compounds.push(`${memberData.village} ${memberData.district}`.toLowerCase())
  }
  
  // Phone combinations with name
  if (memberData.phone && memberData.displayName) {
    compounds.push(`${memberData.displayName} ${memberData.phone.slice(-4)}`.toLowerCase())
  }
  
  // Aadhaar combinations with name
  if (memberData.aadhaarNo && memberData.displayName) {
    compounds.push(`${memberData.displayName} ${memberData.aadhaarNo.slice(-4)}`.toLowerCase())
  }
  
  return compounds
}

// SIMPLIFIED VERSION - Main handler for adding member
export const handleSubmit = async (values, context, message) => {
  const {
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
  } = context

  setLoading(true)
  
  try {
    // Validate program details
    const hasErrors = programDetails.some(p => p.error)
    if (hasErrors) {
      message.error('Please fix program selection errors before submitting')
      setLoading(false)
      return false
    }
    const fileUrls = {}
    // Generate registration number first
    const registrationNumber = await generateRegistrationNumber()
    
     const uploadFileIfNeeded = async (fileValue, folder, fileName) => {
      // If it's a File object, upload it
      if (fileValue instanceof File) {
        return await uploadFile(fileValue, folder, fileName)
      }
      // If it's already a URL (existing file), return it
      else if (typeof fileValue === 'string' && fileValue.startsWith('http')) {
        return fileValue
      }
      // If it's null/undefined, return empty string
      return ''
    }
    
    // Upload all files in parallel
    const uploadPromises = [
      uploadFileIfNeeded(memberPhoto, 'members/photos', `${values.name || 'member'}_photo`),
      uploadFileIfNeeded(guardianPhoto, 'members/guardian_photos', `${values.guardian || 'guardian'}_photo`),
      uploadFileIfNeeded(memberDocFront, 'members/documents', `${values.name || 'member'}_doc_front`),
      uploadFileIfNeeded(memberDocBack, 'members/documents', `${values.name || 'member'}_doc_back`),
      uploadFileIfNeeded(guardianDoc, 'members/guardian_documents', `${values.guardian || 'guardian'}_doc`)
    ]
    
    // Wait for all uploads to complete
    const [photoURL, guardianPhotoURL, documentFrontURL, documentBackURL, guardianDocumentURL] = 
      await Promise.allSettled(uploadPromises)
    
    // Extract values from promises
    fileUrls.photoURL = photoURL.status === 'fulfilled' ? photoURL.value : ''
    fileUrls.guardianPhotoURL = guardianPhotoURL.status === 'fulfilled' ? guardianPhotoURL.value : ''
    fileUrls.documentFrontURL = documentFrontURL.status === 'fulfilled' ? documentFrontURL.value : ''
    fileUrls.documentBackURL = documentBackURL.status === 'fulfilled' ? documentBackURL.value : ''
    fileUrls.guardianDocumentURL = guardianDocumentURL.status === 'fulfilled' ? guardianDocumentURL.value : ''
    
    // Calculate total join fees
    const totalJoinFees = programDetails.reduce((sum, p) => sum + (p.joinFees || 0), 0)
    const actualPaidAmount = parseFloat(paidAmount || 0)
    
    // Validate paid amount
    if (actualPaidAmount > totalJoinFees) {
      message.error(`Paid amount (₹${actualPaidAmount}) cannot exceed total join fees (₹${totalJoinFees})`)
      setLoading(false)
      return false
    }
    
    // Calculate pending amount and payment percentage
    const totalPendingAmount = Math.max(0, totalJoinFees - actualPaidAmount)
    const overallPaymentPercentage = totalJoinFees > 0 ? 
      Math.round((actualPaidAmount / totalJoinFees) * 100) : 0
    
    // Get selected names
    const selectedStateName = states.find(s => s.id === values.state)?.name || ''
    const selectedDistrictName = districts.find(d => d.id === values.district)?.name || ''
    const selectedCityName = cities.find(c => c.id === values.city)?.name || ''
    const selectedCasteName = castes.find(c => c.id === values.caste)?.name || ''
    const selectedRelationName = relations.find(r => r.id === values.guardianRelation)?.name || ''
    
    // Prepare member programs data with SIMPLE PROPORTIONAL DISTRIBUTION
    const memberProgramsData = selectedPrograms.map(programId => {
      const programDetail = programDetails.find(p => p.programId === programId)
      const program = programs.find(p => p.id === programId)
      
      if (!programDetail || programDetail.error) return null
      
      // Simple proportional distribution
      const programJoinFees = programDetail.joinFees || 0
      const proportion = totalJoinFees > 0 ? programJoinFees / totalJoinFees : 0
      const programPaidAmount = Math.round(actualPaidAmount * proportion)
      const programPendingAmount = Math.max(0, programJoinFees - programPaidAmount)
      const programPaymentPercentage = programJoinFees > 0 ? 
        Math.round((programPaidAmount / programJoinFees) * 100) : 0
      
      return {
        programId,
        programName: programDetail.programName,
        ageGroupId: programDetail.ageGroupId,
        ageGroupName: programDetail.ageGroupName,
        joinFees: programJoinFees,
        payAmount: programDetail.payAmount || 0,
        paidAmount: programPaidAmount,
        pendingAmount: programPendingAmount,
        paymentPercentage: programPaymentPercentage,
        paymentStatus: programPaymentPercentage === 100 ? 'paid' : 
                      (programPaymentPercentage > 0 ? 'partial' : 'pending'),
        joinDate: joinDate.format('DD-MM-YYYY'),
        periodStartDate: programDetail.periodStartDate,
        periodEndDate: programDetail.periodEndDate,
        status: 'active',
        addedDate: serverTimestamp(),
        createdBy: currentUser?.uid,
        memberGroupId: program?.memberGroups?.[0]?.id,
        memberGroupName: program?.memberGroups?.[0]?.groupName,
        memberGroupCode: program?.memberGroups?.[0]?.code,
        
        // Searchable fields for subcollection
        search_programName: programDetail.programName?.toLowerCase() || '',
        search_ageGroupName: programDetail.ageGroupName?.toLowerCase() || '',
        search_paymentStatus: programPaymentPercentage === 100 ? 'paid' : 
                            (programPaymentPercentage > 0 ? 'partial' : 'pending')
      }
    }).filter(p => p !== null)

    // Count payment statistics
    const fullyPaidPrograms = memberProgramsData.filter(p => p.paymentPercentage === 100).length
    const partiallyPaidPrograms = memberProgramsData.filter(p => p.paymentPercentage > 0 && p.paymentPercentage < 100).length
    const pendingPrograms = memberProgramsData.filter(p => p.paymentPercentage === 0).length

    // Create search index
    const searchIndex = createSearchIndex({
      name: values.name,
      fatherName: values.fatherName,
      surname: values.surname,
      phone: values.phone,
      aadhaarNo: values.aadhaarNo,
      registrationNumber,
      village: values.village,
      city: selectedCityName,
      district: selectedDistrictName,
      state: selectedStateName,
      caste: selectedCasteName,
      guardian: values.guardian
    })

    // Create compound search strings
    const compoundSearchStrings = createCompoundSearchStrings({
      displayName: values.name,
      fatherName: values.fatherName,
      surname: values.surname,
      village: values.village,
      city: selectedCityName,
      district: selectedDistrictName,
      phone: values.phone,
      aadhaarNo: values.aadhaarNo
    })

    // Main member data
    const memberData = {
      uid: '',
      displayName: values.name,
      fatherName: values.fatherName,
      surname: values.surname,
      caste: selectedCasteName,
      casteId: values.caste,
      phone: values.phone,
      phoneAlt: values.phoneAlt || '',
      dateJoin: joinDate.format('DD-MM-YYYY'),
      dobDate: dobDate.format('DD-MM-YYYY'),
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
      registrationNumber,
      guardian: values.guardian,
      guardianRelation: selectedRelationName,
      guardianRelationId: values.guardianRelation,
      
      addedBy: addedByRole,
      agentId: addedByRole === 'agent' ? selectedAgent : null,
      adminId: addedByRole === 'admin' ? currentUser?.uid : null,
      
      photoURL: fileUrls.photoURL,
      guardianPhotoURL: fileUrls.guardianPhotoURL,
      documentFrontURL: fileUrls.documentFrontURL,
      documentBackURL: fileUrls.documentBackURL,
      guardianDocumentURL: fileUrls.guardianDocumentURL,
      
      delete_flag: false,
      active_flag: true,
      isBlocked: false,
      marriage_flag: false,
      role: 'member',
      
      // Financial summary
      payAmount: memberProgramsData.reduce((sum, p) => sum + (p.payAmount || 0), 0),
      joinFees: totalJoinFees,
      joinFeesDone: joinFeesDone,
      paymentMode: joinFeesDone ? paymentMode : null,
      paidAmount: actualPaidAmount,
      pendingAmount: totalPendingAmount,
      paymentPercentage: overallPaymentPercentage,
      joinFeesTxtId: values.joinFeesTxtId || '',
      transactionDate: values.transactionDate ? values.transactionDate.format('DD-MM-YYYY') : null,
      
      // Program payment summary
      programPaymentSummary: {
        totalPrograms: selectedPrograms.length,
        fullyPaidPrograms: fullyPaidPrograms,
        partiallyPaidPrograms: partiallyPaidPrograms,
        pendingPrograms: pendingPrograms
      },
      
      password: values.password,
      programIds: selectedPrograms,
      
      // SEARCHABLE INDEXING FIELDS
      search_name: values.name?.toLowerCase() || '',
      search_fatherName: values.fatherName?.toLowerCase() || '',
      search_surname: values.surname?.toLowerCase() || '',
      search_fullName: `${values.name} ${values.fatherName} ${values.surname}`.toLowerCase().trim(),
      search_phone: values.phone || '',
      search_phoneLast4: values.phone?.slice(-4) || '',
      search_aadhaar: values.aadhaarNo || '',
      search_aadhaarLast4: values.aadhaarNo?.slice(-4) || '',
      search_registrationNumber: registrationNumber || '',
      search_village: values.village?.toLowerCase() || '',
      search_city: selectedCityName?.toLowerCase() || '',
      search_district: selectedDistrictName?.toLowerCase() || '',
      search_state: selectedStateName?.toLowerCase() || '',
      search_caste: selectedCasteName?.toLowerCase() || '',
      search_guardian: values.guardian?.toLowerCase() || '',
      
      // Array fields for OR queries
      search_keywords: searchIndex,
      search_compounds: compoundSearchStrings,
      
      // Year and month for time-based queries
      joinYear: joinDate.year(),
      joinMonth: joinDate.month() + 1,
      joinYearMonth: joinDate.format('YYYY-MM'),
      
      // Age group for filtering
      ageGroup: age < 18 ? 'minor' : age < 60 ? 'adult' : 'senior',
      
      // Status flags for quick filtering
      hasPendingPayments: totalPendingAmount > 0,
      hasDocuments: !!(fileUrls.photoURL && fileUrls.documentFrontURL),
      isActive: true,
      
      createdAt: serverTimestamp(),
      createdBy: currentUser?.uid,
      updated_at: serverTimestamp()
    }

    // Add member to Firestore
    const memberRef = await addDoc(collection(db, 'members'), memberData)
    const memberId = memberRef.id
    
    // Record join fee transaction if payment was made (SINGLE TRANSACTION)
    if (joinFeesDone && actualPaidAmount > 0) {
      await recordJoinFeeTransaction({
        memberId: memberId,
        displayName: values.name,
        registrationNumber,
        phone: values.phone,
        createdBy: currentUser?.uid
      }, {
        paidAmount: actualPaidAmount,
        totalPendingAmount,
        paymentMode,
        transactionId: values.joinFeesTxtId,
        transactionDate: values.transactionDate,
        programIds: selectedPrograms,
        programNames: programDetails.map(p => p.programName),
        previousBalance: 0,
        newBalance: totalPendingAmount,
        notes: 'Initial join fee payment'
      })
    }

    // Add member programs to subcollection
    const memberProgramsRef = collection(memberRef, 'memberPrograms')
    for (const program of memberProgramsData) {
      await addDoc(memberProgramsRef, program)
    }

    // Create payment summary for analytics
    const programPaymentSummary = {
      memberId: memberId,
      memberName: values.name,
      registrationNumber: registrationNumber,
      totalPrograms: selectedPrograms.length,
      totalJoinFees: totalJoinFees,
      totalPaidAmount: actualPaidAmount,
      totalPendingAmount: totalPendingAmount,
      paymentPercentage: overallPaymentPercentage,
      paymentMode: joinFeesDone ? paymentMode : null,
      programs: memberProgramsData.map(p => ({
        programId: p.programId,
        programName: p.programName,
        joinFees: p.joinFees,
        paidAmount: p.paidAmount,
        pendingAmount: p.pendingAmount,
        paymentPercentage: p.paymentPercentage
      })),
      createdAt: serverTimestamp(),
      updated_at: serverTimestamp()
    }
    
    await addDoc(collection(db, 'memberPaymentSummaries'), programPaymentSummary)

    // Update member with UID
    await updateDoc(memberRef, {
      uid: memberId
    })

    message.success('Member added successfully!')
    setOpen(false)
    return true
    
  } catch (error) {
    console.error('Error adding member:', error)
    message.error('Failed to add member: ' + error.message)
    return false
  } finally {
    setLoading(false)
  }
}

// Function for adding additional payment in Edit mode
export const addAdditionalPayment = async (memberId, paymentData, currentUser) => {
  try {
    // Get current member data
    const memberRef = doc(db, 'members', memberId)
    const memberSnap = await getDoc(memberRef)
    
    if (!memberSnap.exists()) {
      throw new Error('Member not found')
    }
    
    const memberData = memberSnap.data()
    
    // Calculate new balances
    const currentPaidAmount = memberData.paidAmount || 0
    const currentPendingAmount = memberData.pendingAmount || 0
    const additionalAmount = parseFloat(paymentData.amount || 0)
    
    const newPaidAmount = currentPaidAmount + additionalAmount
    const newPendingAmount = Math.max(0, currentPendingAmount - additionalAmount)
    const newPaymentPercentage = memberData.joinFees > 0 ? 
      Math.round((newPaidAmount / memberData.joinFees) * 100) : 0
    
    // Record the additional payment transaction
    const transactionId = await recordJoinFeeTransaction({
      memberId: memberId,
      displayName: memberData.displayName,
      registrationNumber: memberData.registrationNumber,
      phone: memberData.phone,
      createdBy: currentUser?.uid
    }, {
      transactionType: 'additional_payment',
      paidAmount: additionalAmount,
      previousBalance: currentPendingAmount,
      totalPendingAmount: newPendingAmount,
      paymentMode: paymentData.paymentMode,
      transactionId: paymentData.transactionId,
      transactionDate: paymentData.transactionDate,
      notes: paymentData.notes || 'Additional payment via edit'
    })
    
    // Update member's financial summary
    await updateDoc(memberRef, {
      paidAmount: newPaidAmount,
      pendingAmount: newPendingAmount,
      paymentPercentage: newPaymentPercentage,
      hasPendingPayments: newPendingAmount > 0,
      updated_at: serverTimestamp()
    })
    
    // Update member programs with proportional distribution
    await updateProgramPayments(memberId, memberData, newPaidAmount)
    
    return {
      success: true,
      transactionId: transactionId,
      newBalance: newPendingAmount,
      paymentPercentage: newPaymentPercentage
    }
    
  } catch (error) {
    console.error('Error adding additional payment:', error)
    throw error
  }
}

// Update program payments when additional payment is made
const updateProgramPayments = async (memberId, memberData, totalPaidAmount) => {
  try {
    // Fetch member programs
    const programsRef = collection(db, 'members', memberId, 'memberPrograms')
    const snapshot = await getDocs(programsRef)
    
    // Calculate new distribution
    const programDocs = snapshot.docs
    const programData = programDocs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    
    const totalJoinFees = programData.reduce((sum, p) => sum + (p.joinFees || 0), 0)
    
    for (const program of programData) {
      const proportion = program.joinFees / totalJoinFees
      const newPaidAmount = Math.round(totalPaidAmount * proportion)
      const newPendingAmount = Math.max(0, program.joinFees - newPaidAmount)
      const newPaymentPercentage = program.joinFees > 0 ? 
        Math.round((newPaidAmount / program.joinFees) * 100) : 0
      
      const programRef = doc(db, 'members', memberId, 'memberPrograms', program.id)
      await updateDoc(programRef, {
        paidAmount: newPaidAmount,
        pendingAmount: newPendingAmount,
        paymentPercentage: newPaymentPercentage,
        paymentStatus: newPaymentPercentage === 100 ? 'paid' : 
                      (newPaymentPercentage > 0 ? 'partial' : 'pending'),
        updated_at: serverTimestamp()
      })
    }
  } catch (error) {
    console.error('Error updating program payments:', error)
  }
}

// Fetch member transaction history
export const fetchMemberTransactions = async (memberId) => {
  try {
    const q = query(
      collection(db, 'memberJoinFees'),
      where('memberId', '==', memberId)
    )
    
    const snapshot = await getDocs(q)
    const transactions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().createdAt?.toDate?.() || new Date()
    }))
    
    return transactions.sort((a, b) => b.date - a.date)
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return []
  }
}

// Calculate payment statistics
export const calculatePaymentStats = (memberData) => {
  const totalJoinFees = memberData.joinFees || 0
  const paidAmount = memberData.paidAmount || 0
  const pendingAmount = memberData.pendingAmount || 0
  const paymentPercentage = memberData.paymentPercentage || 0
  
  return {
    totalJoinFees,
    paidAmount,
    pendingAmount,
    paymentPercentage,
    isFullyPaid: paymentPercentage === 100,
    isPartiallyPaid: paymentPercentage > 0 && paymentPercentage < 100,
    isUnpaid: paymentPercentage === 0
  }
}

// Export member data with transactions
export const exportMemberData = async (memberId) => {
  try {
    // Get member data
    const memberRef = doc(db, 'members', memberId)
    const memberSnap = await getDoc(memberRef)
    
    if (!memberSnap.exists()) {
      throw new Error('Member not found')
    }
    
    const memberData = memberSnap.data()
    
    // Get transactions
    const transactions = await fetchMemberTransactions(memberId)
    
    // Get program details
    const programsRef = collection(db, 'members', memberId, 'memberPrograms')
    const programsSnap = await getDocs(programsRef)
    const programs = programsSnap.docs.map(doc => doc.data())
    
    return {
      member: memberData,
      transactions,
      programs,
      summary: calculatePaymentStats(memberData)
    }
    
  } catch (error) {
    console.error('Error exporting member data:', error)
    throw error
  }
}

export const checkAadhaarDuplicate = async (aadhaarNumber) => {
  try {
    if (!aadhaarNumber || aadhaarNumber.length !== 12) {
      return null
    }

    // Aadhaar number से member search करें
    const q = query(
      collection(db, 'members'),
      where('aadhaarNo', '==', aadhaarNumber),
      where('delete_flag', '!=', true)
    )
    
    const snapshot = await getDocs(q)
    
    if (snapshot.empty) {
      return null
    }
    
    // पहला matching member लें (unique होना चाहिए)
    const memberDoc = snapshot.docs[0]
    const memberData = memberDoc.data()
    
    // Member के programs fetch करें
    const programsRef = collection(db, 'members', memberDoc.id, 'memberPrograms')
    const programsSnap = await getDocs(programsRef)
    const programs = programsSnap.docs.map(doc => doc.data())
    
    return {
      memberId: memberDoc.id,
      ...memberData,
      programs: programs
    }
    
  } catch (error) {
    console.error('Error checking Aadhaar duplicate:', error)
    throw error
  }
}