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
    const prefix = 'MEM';

    const now = dayjs();
    const year = now.format('YY');  // 26
    const month = now.format('MM'); // 01

    // Query only active members
    const q = query(
      collection(db, 'members'),
      where('status', '==', 'active'),
      where('active_flag', '==', true)
    );

    const snapshot = await getDocs(q);
    const count = snapshot.size + 1;

    const paddedCount = count.toString().padStart(4, '0');
    // Final format: MEM00052601
    return `${prefix}${paddedCount}${year}${month}`;

  } catch (error) {
    console.error('Error generating registration number:', error);

    // Fallback with full timestamp (safe)
    return `MEM${dayjs().format('YYYYMMDDHHmmss')}`;
  }
};

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
export const memberAccoiuntCreate=async(memberData)=>{
 
  const currentUser=auth.currentUser
try {
   fetch('/api/members',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Accept':'application/json',
      'authorization':`Bearer ${await currentUser.getIdToken()}`
    },
    body:JSON.stringify({
      isOnlyAccountCreate:false,
      memberData:memberData,
      memberId:memberData.id, agentId:memberData.agentId,
      operation:"add"
    })
   }).then(res=>res.json()).then(data=>{
    console.log(data)
   }).catch(error=>{
    console.log(error)
   }  
    )


} catch (error) {
  console.log(error)
}
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
    // Validate program details
    const hasErrors = programDetails.some(p => p.error)
    if (hasErrors) {
      message.error('Please fix program selection errors before submitting')
      setLoading(false)
      return false
    }

    // Generate registration number first
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
    
    // Calculate total join fees
    const totalJoinFees = programDetails.reduce((sum, p) => sum + (p.joinFees || 0), 0)
    const actualPaidAmount = parseFloat(paidAmount || 0)
    
    // Validate paid amount
    if (actualPaidAmount > totalJoinFees) {
      message.error(`Paid amount (₹${actualPaidAmount}) cannot exceed total join fees (₹${totalJoinFees})`)
      setLoading(false)
      return false
    }
    
    // Calculate program payments with PRIORITY ORDER allocation
    const calculateProgramPayments = (programs, paidAmount) => {
      const result = []
      let remainingAmount = paidAmount
      
      // Sort programs if needed (by joinFees or programId)
      const sortedPrograms = [...programs].sort((a, b) => {
        // You can customize sorting logic here
        // For example: sort by programId or joinFees
        return (b.joinFees || 0) - (a.joinFees || 0) // Higher fees first
      })
      
      for (const program of sortedPrograms) {
        const programFees = program.joinFees || 0
        
        if (remainingAmount <= 0) {
          // No money left for this program
          result.push({
            programId: program.programId,
            programName: program.programName,
            joinFees: programFees,
            paidAmount: 0,
            pendingAmount: programFees,
            paymentPercentage: 0
          })
        } else if (remainingAmount >= programFees) {
          // Full payment for this program
          result.push({
            programId: program.programId,
            programName: program.programName,
            joinFees: programFees,
            paidAmount: programFees,
            pendingAmount: 0,
            paymentPercentage: 100
          })
          remainingAmount -= programFees
        } else {
          // Partial payment for this program
          const programPaidAmount = remainingAmount
          result.push({
            programId: program.programId,
            programName: program.programName,
            joinFees: programFees,
            paidAmount: programPaidAmount,
            pendingAmount: programFees - programPaidAmount,
            paymentPercentage: Math.round((programPaidAmount / programFees) * 100)
          })
          remainingAmount = 0
        }
      }
      
      return result
    }
    
    // Calculate payments with priority order
    const programPayments = calculateProgramPayments(programDetails, actualPaidAmount)
    
    // Calculate overall totals
    const totalPendingAmount = programPayments.reduce((sum, p) => sum + p.pendingAmount, 0)
    const overallPaymentPercentage = totalJoinFees > 0 ? 
      Math.round(((totalJoinFees - totalPendingAmount) / totalJoinFees) * 100) : 0
    
    // Get selected names
    const selectedStateName = states.find(s => s.id === values.state)?.name || ''
    const selectedDistrictName = districts.find(d => d.id === values.district)?.name || ''
    const selectedCityName = cities.find(c => c.id === values.city)?.name || ''
    const selectedCasteName = castes.find(c => c.id === values.caste)?.name || ''
    const selectedRelationName = relations.find(r => r.id === values.guardianRelation)?.name || ''
    
    // Prepare member programs data
    const memberProgramsData = programPayments.map(payment => {
      const programDetail = programDetails.find(p => p.programId === payment.programId)
      const program = programs.find(p => p.id === payment.programId)
      
      return {
        programId: payment.programId,
        programName: payment.programName,
        
        ageGroupId: programDetail?.ageGroupId,
        ageGroupName: programDetail?.ageGroupName,
        joinFees: payment.joinFees,
        payAmount: programDetail?.payAmount || 0,
        paidAmount: payment.paidAmount,
        pendingAmount: payment.pendingAmount,
        paymentPercentage: payment.paymentPercentage,
        paymentStatus: payment.paymentPercentage === 100 ? 'paid' : 
                      (payment.paymentPercentage > 0 ? 'partial' : 'pending'),
        joinDate: joinDate.format('DD-MM-YYYY'),
        periodStartDate: programDetail?.periodStartDate,
        periodEndDate: programDetail?.periodEndDate,
        status: 'active',
        addedDate: serverTimestamp(),
        createdBy: currentUser?.uid,
        memberGroupId: program?.memberGroups?.[0]?.id,
        memberGroupName: program?.memberGroups?.[0]?.groupName,
        memberGroupCode: program?.memberGroups?.[0]?.code,
        
        // Searchable fields
        search_programName: payment.programName?.toLowerCase() || '',
        search_ageGroupName: programDetail?.ageGroupName?.toLowerCase() || '',
        search_paymentStatus: payment.paymentPercentage === 100 ? 'paid' : 
                            (payment.paymentPercentage > 0 ? 'partial' : 'pending')
      }
    })

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
    
      // Array fields for OR queries
      search_keywords: searchIndex,
      
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
    
    // Record join fee transaction if payment was made
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

  if (!program.programId) {
    console.log("Program ID missing");
    continue;
  }

  // 👇 Yaha custom ID use ho raha hai
  const programDocRef = doc(memberProgramsRef, program.programId);
   const programData={...program,memberId:memberId}
  await setDoc(programDocRef, programData, { merge: true });
}

    // Create account
    await memberAccoiuntCreate({...memberData, id: memberId})
    
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