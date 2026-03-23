import { 
  collection, addDoc, serverTimestamp, query, where, getDocs, 
  getDoc, doc, updateDoc, deleteDoc, 
  setDoc
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import dayjs from 'dayjs'
import { auth, db, storage } from '../../../../../lib/firbase-client'
import { message } from 'antd'

// File upload utility
export const uploadFile = async (file, folder, fileName) => {
  if (!file) return ''
  
  if (typeof file === 'string' && file.startsWith('http')) {
    return file
  }
  
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
    const prefix = 'MEM';
    const now = dayjs();
    const year = now.format('YY');
    const month = now.format('MM');

    const q = query(
      collection(db, 'members'),
      where('status', '==', 'active'),
      where('active_flag', '==', true)
    );

    const snapshot = await getDocs(q);
    const count = snapshot.size + 1;
    const paddedCount = count.toString().padStart(4, '0');

    return `${prefix}${paddedCount}${year}${month}`;
  } catch (error) {
    console.error('Error generating registration number:', error);
    return `MEM${dayjs().format('YYYYMMDDHHmmss')}`;
  }
};

// Create search index
export function createSearchIndex(data) {
  const indexSet = new Set();

  const addPrefixes = (text) => {
    const str = String(text).toLowerCase().trim();
    if (!str) return;

    indexSet.add(str);
    
    str.split(/\s+/).forEach(word => {
      if (word.length > 1) {
        indexSet.add(word);
        let prefix = "";
        for (const ch of word) {
          prefix += ch;
          if (prefix.length > 1) {
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

// Record join fee transaction
export const recordJoinFeeTransaction = async (memberData, paymentData) => {
  try {
    const transactionRef = await addDoc(collection(db, 'memberJoinFees'), {
      memberId: memberData.memberId,
      memberName: memberData.displayName,
      registrationNumber: memberData.registrationNumber,
      memberPhone: memberData.phone,
      
      transactionType: paymentData.transactionType || 'join_fee',
      amount: parseFloat(paymentData.paidAmount || 0),
      previousBalance: paymentData.previousBalance || 0,
      newBalance: parseFloat(paymentData.totalPendingAmount || 0),
      
      paymentMode: paymentData.paymentMode,
      transactionId: paymentData.transactionId || '',
      transactionDate: paymentData.transactionDate 
        ? dayjs(paymentData.transactionDate).format('DD-MM-YYYY')
        : dayjs().format('DD-MM-YYYY'),
      
      // ✅ Single program (not array)
      programId: paymentData.programId || '',
      programName: paymentData.programName || '',
      
      status: 'completed',
      verified: true,
      notes: paymentData.notes || 'Initial join fee payment',
      
      createdBy: memberData.createdBy,
      createdAt: serverTimestamp(),
      updated_at: serverTimestamp(),
      
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

export const memberAccoiuntCreate = async (memberData) => {
  const currentUser = auth.currentUser
  try {
    fetch('/api/members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'authorization': `Bearer ${await currentUser.getIdToken()}`
      },
      body: JSON.stringify({
        isOnlyAccountCreate: false,
        memberData: memberData,
        memberId: memberData.id,
        agentId: memberData.agentId,
        operation: "add"
      })
    }).then(res => res.json()).then(data => {
      console.log(data)
    }).catch(error => {
      console.log(error)
    })
  } catch (error) {
    console.log(error)
  }
}
export const createClosingPayment = async (memberData) => {
  const currentUser = auth.currentUser
  try {
    fetch('/api/create-closing-payment-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'authorization': `Bearer ${await currentUser.getIdToken()}`
      },
      body: JSON.stringify({
         memberId: memberData.id,
      })
    }).then(res => res.json()).then(data => {
      console.log(data)
    }).catch(error => {
      console.log(error)
    })
  } catch (error) {
    console.log(error)
  }
}
// ✅ MAIN HANDLER - Program details stored in member document directly
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
    addedByName,
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
    // ✅ Since one member = one program, get the single program
    // selectedPrograms[0] is the single selected program ID
    const selectedProgramId = selectedPrograms?.[0] || null
    const selectedProgramDetail = programDetails?.[0] || null
    const selectedProgram = programs?.find(p => p.id === selectedProgramId) || null

    if (!selectedProgramId || !selectedProgramDetail) {
      message.error('Please select a program before submitting')
      setLoading(false)
      return false
    }

    // Generate registration number
    const registrationNumber = await generateRegistrationNumber()
    
    // Upload files
    const fileUrls = await uploadAllFiles({
      memberPhoto,
      guardianPhoto,
      memberDocFront,
      memberDocBack,
      guardianDoc,
      memberName: values.name,
      guardianName: values.guardian
    })
    
    // ✅ Single program fees
    const totalJoinFees = selectedProgramDetail.joinFees || 0
    const actualPaidAmount = parseFloat(paidAmount || 0)
    
    if (actualPaidAmount > totalJoinFees) {
      message.error(`Paid amount (₹${actualPaidAmount}) cannot exceed total join fees (₹${totalJoinFees})`)
      setLoading(false)
      return false
    }
    
    // ✅ Calculate payment for single program
    const pendingAmount = Math.max(0, totalJoinFees - actualPaidAmount)
    const paymentPercentage = totalJoinFees > 0
      ? Math.round((actualPaidAmount / totalJoinFees) * 100)
      : 0
    const paymentStatus =
      paymentPercentage === 100 ? 'paid' :
      paymentPercentage > 0    ? 'partial' : 'pending'

    // Get selected names
    const selectedStateName    = states.find(s => s.id === values.state)?.name || ''
    const selectedDistrictName = districts.find(d => d.id === values.district)?.name || ''
    const selectedCityName     = cities.find(c => c.id === values.city)?.name || ''
    const selectedCasteName    = castes.find(c => c.id === values.caste)?.name || ''
    const selectedRelationName = relations.find(r => r.id === values.guardianRelation)?.name || ''

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
      guardian: values.guardian,
      // ✅ Program info also searchable
      programName: selectedProgramDetail.programName,
      ageGroupName: selectedProgramDetail.ageGroupName
    })

    // ✅ Full member document with program details embedded directly
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
      addedByName: addedByName,
      photoURL: fileUrls.photoURL,
      guardianPhotoURL: fileUrls.guardianPhotoURL,
      documentFrontURL: fileUrls.documentFrontURL,
      documentBackURL: fileUrls.documentBackURL,
      guardianDocumentURL: fileUrls.guardianDocumentURL,
      
      delete_flag: false,
      active_flag: true,
      isBlocked: false,
      marriage_flag: false,
      payment_flag: false,
      role: 'member',
      status: 'active',

      // ✅ Program details stored directly on the member document
      programId: selectedProgramId,
      programName: selectedProgramDetail.programName || '',
      ageGroupId: selectedProgramDetail.ageGroupId || '',
      ageGroupName: selectedProgramDetail.ageGroupName || '',
      periodStartDate: selectedProgramDetail.periodStartDate || '',
      periodEndDate: selectedProgramDetail.periodEndDate || '',
      memberGroupId: selectedProgram?.memberGroups?.[0]?.id || '',
      memberGroupName: selectedProgram?.memberGroups?.[0]?.groupName || '',
      memberGroupCode: selectedProgram?.memberGroups?.[0]?.code || '',
      programJoinDate: joinDate.format('DD-MM-YYYY'),
      programStatus: 'active',

      // ✅ Financial fields
      payAmount: selectedProgramDetail.payAmount || 0,
      joinFees: totalJoinFees,
      joinFeesDone: joinFeesDone,
      paymentMode: joinFeesDone ? paymentMode : null,
      paidAmount: actualPaidAmount,
      pendingAmount: pendingAmount,
      paymentPercentage: paymentPercentage,
      paymentStatus: paymentStatus,
      joinFeesTxtId: values.joinFeesTxtId || '',
      transactionDate: values.transactionDate
        ? values.transactionDate.format('DD-MM-YYYY')
        : null,
      
      password: values.password,

      // ✅ Search & filter fields
      search_keywords: searchIndex,
      search_programName: selectedProgramDetail.programName?.toLowerCase() || '',
      search_ageGroupName: selectedProgramDetail.ageGroupName?.toLowerCase() || '',
      search_paymentStatus: paymentStatus,

      joinYear: joinDate.year(),
      joinMonth: joinDate.month() + 1,
      joinYearMonth: joinDate.format('YYYY-MM'),
      ageGroup: age < 18 ? 'minor' : age < 60 ? 'adult' : 'senior',
      hasPendingPayments: pendingAmount > 0,
      hasDocuments: !!(fileUrls.photoURL && fileUrls.documentFrontURL),
      isActive: true,
      
      createdAt: serverTimestamp(),
      createdBy: currentUser?.uid,
      updated_at: serverTimestamp()
    }

    // ✅ Add member to Firestore (no subcollection needed)
    const memberRef = await addDoc(collection(db, 'members'), memberData)
    const memberId = memberRef.id
    
    // ✅ Record join fee transaction with single program info
    if (joinFeesDone && actualPaidAmount > 0) {
      await recordJoinFeeTransaction({
        memberId: memberId,
        displayName: values.name,
        registrationNumber,
        phone: values.phone,
        createdBy: currentUser?.uid
      }, {
        paidAmount: actualPaidAmount,
        totalPendingAmount: pendingAmount,
        paymentMode,
        transactionId: values.joinFeesTxtId,
        transactionDate: values.transactionDate,
        programId: selectedProgramId,
        programName: selectedProgramDetail.programName,
        previousBalance: 0,
        newBalance: pendingAmount,
        notes: 'Initial join fee payment'
      })
    }
    
    // ✅ Create account
    await memberAccoiuntCreate({ ...memberData, id: memberId })
    await createClosingPayment({ ...memberData, id: memberId })
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

// ✅ Additional payment - update directly on member document
export const addAdditionalPayment = async (memberId, paymentData, currentUser) => {
  try {
    const memberRef = doc(db, 'members', memberId)
    const memberSnap = await getDoc(memberRef)
    
    if (!memberSnap.exists()) {
      throw new Error('Member not found')
    }
    
    const memberData = memberSnap.data()
    
    const currentPaidAmount   = memberData.paidAmount || 0
    const currentPendingAmount = memberData.pendingAmount || 0
    const additionalAmount    = parseFloat(paymentData.amount || 0)
    
    const newPaidAmount        = currentPaidAmount + additionalAmount
    const newPendingAmount     = Math.max(0, currentPendingAmount - additionalAmount)
    const newPaymentPercentage = memberData.joinFees > 0
      ? Math.round((newPaidAmount / memberData.joinFees) * 100)
      : 0
    const newPaymentStatus =
      newPaymentPercentage === 100 ? 'paid' :
      newPaymentPercentage > 0    ? 'partial' : 'pending'

    // ✅ Record transaction with single program info
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
      programId: memberData.programId || '',
      programName: memberData.programName || '',
      notes: paymentData.notes || 'Additional payment via edit'
    })
    
    // ✅ Update member document directly (no subcollection update needed)
    await updateDoc(memberRef, {
      paidAmount: newPaidAmount,
      pendingAmount: newPendingAmount,
      paymentPercentage: newPaymentPercentage,
      paymentStatus: newPaymentStatus,
      hasPendingPayments: newPendingAmount > 0,
      updated_at: serverTimestamp()
    })
    
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
  const totalJoinFees     = memberData.joinFees || 0
  const paidAmount        = memberData.paidAmount || 0
  const pendingAmount     = memberData.pendingAmount || 0
  const paymentPercentage = memberData.paymentPercentage || 0
  
  return {
    totalJoinFees,
    paidAmount,
    pendingAmount,
    paymentPercentage,
    isFullyPaid:      paymentPercentage === 100,
    isPartiallyPaid:  paymentPercentage > 0 && paymentPercentage < 100,
    isUnpaid:         paymentPercentage === 0
  }
}

// Export member data with transactions
export const exportMemberData = async (memberId) => {
  try {
    const memberRef  = doc(db, 'members', memberId)
    const memberSnap = await getDoc(memberRef)
    
    if (!memberSnap.exists()) {
      throw new Error('Member not found')
    }
    
    const memberData    = memberSnap.data()
    const transactions  = await fetchMemberTransactions(memberId)
    
    return {
      member: memberData,
      transactions,
      // ✅ Program info comes from member document directly
      program: {
        programId:       memberData.programId,
        programName:     memberData.programName,
        ageGroupId:      memberData.ageGroupId,
        ageGroupName:    memberData.ageGroupName,
        periodStartDate: memberData.periodStartDate,
        periodEndDate:   memberData.periodEndDate,
        memberGroupId:   memberData.memberGroupId,
        memberGroupName: memberData.memberGroupName,
        paymentStatus:   memberData.paymentStatus,
        paidAmount:      memberData.paidAmount,
        pendingAmount:   memberData.pendingAmount,
        joinFees:        memberData.joinFees
      },
      summary: calculatePaymentStats(memberData)
    }
    
  } catch (error) {
    console.error('Error exporting member data:', error)
    throw error
  }
}

// Check Aadhaar duplicate
export const checkAadhaarDuplicate = async (aadhaarNumber) => {
  try {
    if (!aadhaarNumber || aadhaarNumber.length !== 12) {
      return null
    }

    const q = query(
      collection(db, 'members'),
      where('aadhaarNo', '==', aadhaarNumber),
      where('delete_flag', '!=', true)
    )
    
    const snapshot = await getDocs(q)
    
    if (snapshot.empty) {
      return null
    }
    
    const memberDoc  = snapshot.docs[0]
    const memberData = memberDoc.data()
    
    // ✅ Program info comes from member document directly (no subcollection fetch)
    return {
      memberId: memberDoc.id,
      ...memberData,
      // Expose program as a flat object for convenience
      program: {
        programId:    memberData.programId,
        programName:  memberData.programName,
        ageGroupId:   memberData.ageGroupId,
        ageGroupName: memberData.ageGroupName,
        paymentStatus: memberData.paymentStatus
      }
    }
    
  } catch (error) {
    console.error('Error checking Aadhaar duplicate:', error)
    throw error
  }
}