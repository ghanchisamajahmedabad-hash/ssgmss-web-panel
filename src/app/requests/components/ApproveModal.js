import { Button, Drawer, Form, Spin, Alert, Radio, Input, Row, Col, Table, Typography, message, App, DatePicker } from 'antd'
import React, { useState, useEffect } from 'react'
import { 
  CloseCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined
} from '@ant-design/icons'
import { collection, doc, serverTimestamp, updateDoc, getDocs, query, where, addDoc } from 'firebase/firestore'
import { db } from '../../../../lib/firbase-client'
import dayjs from 'dayjs'
import { createSearchIndex, generateRegistrationNumber, memberAccoiuntCreate } from '@/app/members/components/components/firebaseUtils'

const { Text } = Typography

const ApproveModal = ({open,setOpen,selectedMember,setSelectedMember,getProgramNames,fetchAllData,programList,user}) => {
  const [form] = Form.useForm()
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)
  const [joinFeesDone, setJoinFeesDone] = useState(false)
  const [paymentMode, setPaymentMode] = useState('cash')
  const [paidAmount, setPaidAmount] = useState(0)
  const [programDetails, setProgramDetails] = useState([])
  const [programPayments, setProgramPayments] = useState([])


 
  // Calculate program details when selectedMember changes
  useEffect(() => {
    if (selectedMember && selectedMember.programIds && programList) {
      calculateProgramDetails()
    }
  }, [selectedMember, programList])

  // Recalculate payments when paidAmount or joinFeesDone changes
  useEffect(() => {
    if (programDetails.length > 0) {
      const payments = calculateProgramPayments(programDetails, parseFloat(paidAmount || 0))
      setProgramPayments(payments)
    }
  }, [programDetails, paidAmount])

  const calculateProgramDetails = () => {
    if (!selectedMember || !programList) return

    const details = selectedMember.programIds.map(programId => {
      const program = programList.find(p => p.id === programId)
      
      if (!program) return null

      // Try to find appropriate age group based on member's age
      const calculatedAge = selectedMember.age || 0
      let ageGroup = null
      
      if (program.ageGroups && program.ageGroups.length > 0) {
        ageGroup = program.ageGroups.find(ag => 
          calculatedAge >= ag.startAge && calculatedAge <= ag.endAge
        )
      }

      // Find appropriate period based on join date
      let period = null
      const joinDateStr = selectedMember.dateJoin
      
      if (ageGroup && ageGroup.periods && ageGroup.periods.length > 0) {
        period = ageGroup.periods.find(p => {
          const start = dayjs(p.startDate, 'DD-MM-YYYY')
          const end = dayjs(p.endDate, 'DD-MM-YYYY')
          const join = dayjs(joinDateStr, 'DD-MM-YYYY')
          return join.isBetween(start, end, null, '[]')
        })
      }

      return {
        programId: program.id,
        programName: program.name,
        ageGroupId: ageGroup?.id,
        ageGroupName: ageGroup?.ageGroupName,
        joinFees: period?.joinFees || program.joinFees || 0,
        fixedJoinFees: period?.fixedJoinFees || 0,
        payAmount: period?.payAmount || 0,
        periodStartDate: period?.startDate,
        periodEndDate: period?.endDate,
        hasPeriod: !!period
      }
    }).filter(detail => detail !== null)

    setProgramDetails(details)
    
    // Auto-fill paid amount with total join fees
    const totalJoinFees = details.reduce((sum, p) => sum + (p.joinFees || 0), 0)
    setPaidAmount(totalJoinFees)
    form.setFieldsValue({ paidAmount: totalJoinFees })
  }

  const calculateProgramPayments = (programs, paidAmount) => {
    if (!programs || programs.length === 0) return []
    
    let remainingAmount = paidAmount
    
    const result = programs.map(p => {
      const programFees = p.joinFees || 0
      
      if (remainingAmount <= 0) {
        return {
          programId: p.programId,
          programName: p.programName,
          joinFees: programFees,
          paidAmount: 0,
          pendingAmount: programFees,
          paymentPercentage: 0
        }
      } else if (remainingAmount >= programFees) {
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

  const calculateTotalJoinFees = () => {
    return programDetails.reduce((sum, p) => sum + (p.joinFees || 0), 0)
  }

  const handleJoinFeesDoneChange = (e) => {
    const isDone = e.target.value
    setJoinFeesDone(isDone)
    if (isDone) {
      const totalJoinFees = calculateTotalJoinFees()
      setPaidAmount(totalJoinFees)
      form.setFieldsValue({ paidAmount: totalJoinFees })
    } else {
      setPaidAmount(0)
      form.setFieldsValue({ paidAmount: 0 })
    }
  }

  const handlePaidAmountChange = (e) => {
    const value = e.target.value
    setPaidAmount(value)
    
    const totalFees = calculateTotalJoinFees()
    if (parseFloat(value) > totalFees) {
      message.warning(`Paid amount cannot exceed total join fees of ₹${totalFees}`)
    }
  }



  // Record join fee transaction
  const recordJoinFeeTransaction = async (memberData, paymentData) => {
    try {
      const transactionRef = await addDoc(collection(db, 'memberJoinFees'), {
        memberId: memberData.memberId,
        memberName: memberData.displayName,
        registrationNumber: memberData.registrationNumber,
        memberPhone: memberData.phone,
        
        transactionType: 'join_fee_approval',
        amount: parseFloat(paymentData.paidAmount || 0),
        previousBalance: paymentData.previousBalance || 0,
        newBalance: parseFloat(paymentData.totalPendingAmount || 0),
        
        paymentMode: paymentData.paymentMode,
        transactionId: paymentData.transactionId || '',
        transactionDate: paymentData.transactionDate 
          ? dayjs(paymentData.transactionDate).format('DD-MM-YYYY')
          : dayjs().format('DD-MM-YYYY'),
        
        programIds: paymentData.programIds || [],
        programNames: paymentData.programNames || [],
        
        status: 'completed',
        verified: true,
        notes: paymentData.notes || 'Join fee payment during approval',
        
        approvedBy: user?.uid,
        approvedByName: user?.displayName || user?.email,
        approvedAt: serverTimestamp(),
        
        createdBy: user?.uid,
        createdAt: serverTimestamp(),
        updated_at: serverTimestamp()
      });
      
      return transactionRef.id;
    } catch (error) {
      console.error('Error recording transaction:', error)
      throw error
    }
  }

const executeApproval = async () => {
  if (!selectedMember) return
  
  try {
    setLoading(true)
    
    // Calculate total join fees
    const totalJoinFees = calculateTotalJoinFees()
    const actualPaidAmount = parseFloat(paidAmount || 0)
    
    // Validate paid amount only if join fees are being paid
    if (joinFeesDone && actualPaidAmount > totalJoinFees) {
      message.error(`Paid amount (₹${actualPaidAmount}) cannot exceed total join fees (₹${totalJoinFees})`)
      setLoading(false)
      return
    }
    
    // Calculate program payments - ONLY if join fees are paid
    // If joinFeesDone is false, all payments should be 0
    const programPayments = joinFeesDone 
      ? calculateProgramPayments(programDetails, actualPaidAmount)
      : programDetails.map(p => ({
          programId: p.programId,
          programName: p.programName,
          joinFees: p.joinFees || 0,
          paidAmount: 0,
          pendingAmount: p.joinFees || 0,
          paymentPercentage: 0
        }))
    
    // Calculate totals based on joinFeesDone
    const totalPaid = joinFeesDone 
      ? programPayments.reduce((sum, p) => sum + p.paidAmount, 0)
      : 0
    const totalPending = joinFeesDone 
      ? programPayments.reduce((sum, p) => sum + p.pendingAmount, 0)
      : totalJoinFees
    
    const paymentPercentage = joinFeesDone && totalJoinFees > 0 
      ? Math.round((totalPaid / totalJoinFees) * 100) 
      : 0
    
    // Count payment statistics
    const fullyPaidPrograms = programPayments.filter(p => p.paymentPercentage === 100).length
    const partiallyPaidPrograms = programPayments.filter(p => p.paymentPercentage > 0 && p.paymentPercentage < 100).length
    const pendingPrograms = programPayments.filter(p => p.paymentPercentage === 0).length
    
    // Generate final registration number
    const finalRegNumber = await generateRegistrationNumber()
    const searchIndex = createSearchIndex({
      name: selectedMember.displayName,
      fatherName: selectedMember.fatherName,
      surname: selectedMember.surname,
      phone: selectedMember.phone,
      aadhaarNo: selectedMember.aadhaarNo,
      registrationNumber: finalRegNumber,
      village: selectedMember.village,
      city: selectedMember.city,
      district: selectedMember.district,
      state: selectedMember.state,
      caste: selectedMember.caste,
      guardian: selectedMember.guardian
    })
    
    // Update member status to active
    await updateDoc(doc(db, 'members', selectedMember.id), {
      status: 'active',
      active_flag: true,
      dateJoin: dayjs().format('DD-MM-YYYY'),
      isPendingApproval: false,
      registrationNumber: finalRegNumber,
      approvedBy: user?.uid,
      approvedByName: user?.displayName || user?.email,
      approvedAt: serverTimestamp(),
      updated_at: serverTimestamp(),
      createdAt: serverTimestamp(),
      search_keywords: searchIndex,
      // Financial fields - properly handle when joinFeesDone is false
      joinFees: totalJoinFees,
      joinFeesDone: joinFeesDone,
      paymentMode: joinFeesDone ? paymentMode : null,
      paidAmount: joinFeesDone ? actualPaidAmount : 0,
      pendingAmount: totalPending,
      paymentPercentage: paymentPercentage,
      joinFeesTxtId: joinFeesDone ? form.getFieldValue('joinFeesTxtId') || '' : '',
      transactionDate: joinFeesDone && form.getFieldValue('transactionDate') 
        ? form.getFieldValue('transactionDate').format('DD-MM-YYYY') 
        : null,
      
      // Program payment summary
      programPaymentSummary: {
        totalPrograms: selectedMember.programIds?.length || 0,
        fullyPaidPrograms: fullyPaidPrograms,
        partiallyPaidPrograms: partiallyPaidPrograms,
        pendingPrograms: pendingPrograms
      },
      
      hasPendingPayments: totalPending > 0,
      
      // Remove pending prefix from search fields
      search_registrationNumber: finalRegNumber,
    })
    
    // Update member programs status and payment info
    const programsRef = collection(db, 'members', selectedMember.id, 'memberPrograms')
    const programsSnap = await getDocs(programsRef)
    
    const updatePromises = programsSnap.docs.map(async (programDoc) => {
      const programData = programDoc.data()
      const paymentInfo = programPayments.find(p => p.programId === programData.programId)
      
      if (paymentInfo) {
        await updateDoc(programDoc.ref, {
          status: 'active',
          joinFees: paymentInfo.joinFees,
          paidAmount: paymentInfo.paidAmount,
          pendingAmount: paymentInfo.pendingAmount,
          paymentPercentage: paymentInfo.paymentPercentage,
          paymentStatus: paymentInfo.paymentPercentage === 100 ? 'paid' : 
                        (paymentInfo.paymentPercentage > 0 ? 'partial' : 'pending'),
          updated_at: serverTimestamp()
        })
      } else {
        await updateDoc(programDoc.ref, {
          status: 'active',
          updated_at: serverTimestamp()
        })
      }
    })
    
    await Promise.all(updatePromises)
    
    // Record join fee transaction ONLY if payment was made (joinFeesDone is true and amount > 0)
    if (joinFeesDone && actualPaidAmount > 0) {
      await recordJoinFeeTransaction({
        memberId: selectedMember.id,
        displayName: selectedMember.displayName,
        registrationNumber: finalRegNumber,
        phone: selectedMember.phone
      }, {
        paidAmount: actualPaidAmount,
        totalPendingAmount: totalPending,
        paymentMode: paymentMode,
        transactionId: form.getFieldValue('joinFeesTxtId'),
        transactionDate: form.getFieldValue('transactionDate'),
        programIds: selectedMember.programIds,
        programNames: programDetails.map(p => p.programName),
        previousBalance: 0,
        newBalance: totalPending,
        notes: 'Join fee payment during approval'
      })
    }
    
    const memberData = {
      ...selectedMember,
      status: 'active',
      active_flag: true,
      dateJoin: dayjs().format('DD-MM-YYYY'),
      registrationNumber: finalRegNumber,
      approvedBy: user?.uid,
      approvedByName: user?.displayName || user?.email,
      approvedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updated_at: serverTimestamp(),
      search_keywords: searchIndex,
      // Financial fields
      joinFees: totalJoinFees,
      joinFeesDone: joinFeesDone,
      paymentMode: joinFeesDone ? paymentMode : null,
      paidAmount: joinFeesDone ? actualPaidAmount : 0,
      pendingAmount: totalPending,
      paymentPercentage: paymentPercentage,
      joinFeesTxtId: joinFeesDone ? form.getFieldValue('joinFeesTxtId') || '' : '',
      transactionDate: joinFeesDone && form.getFieldValue('transactionDate') 
        ? form.getFieldValue('transactionDate').format('DD-MM-YYYY') 
        : null,
      
      // Program payment summary
      programPaymentSummary: {
        totalPrograms: selectedMember.programIds?.length || 0,
        fullyPaidPrograms: fullyPaidPrograms,
        partiallyPaidPrograms: partiallyPaidPrograms,
        pendingPrograms: pendingPrograms
      },
      
      hasPendingPayments: totalPending > 0,
      
      // Remove pending prefix from search fields
      search_registrationNumber: finalRegNumber,
    }
    
    await memberAccoiuntCreate(memberData)
    message.success(`Member approved successfully! New Registration: ${finalRegNumber}`)
    setOpen(false)
    setSelectedMember(null)
    resetForm()
    fetchAllData()
  } catch (error) {
    console.error('Error approving member:', error)
    message.error('Failed to approve member: ' + error.message)
  } finally {
    setLoading(false)
  }
}

  const resetForm = () => {
    form.resetFields()
    setJoinFeesDone(false)
    setPaymentMode('cash')
    setPaidAmount(0)
    setProgramDetails([])
    setProgramPayments([])
  }

  const handleClose = () => {
    if (!loading) {
      setOpen(false)
      resetForm()
    }
  }

  // Payment columns for the table
  const paymentColumns = [
    {
      title: 'Program',
      dataIndex: 'programName',
      key: 'programName',
      width: '30%',
    },
    {
      title: 'Fees',
      dataIndex: 'joinFees',
      key: 'joinFees',
      render: (fees) => <Text strong>₹{fees}</Text>,
      align: 'right',
      width: '15%',
    },
    {
      title: 'Paid',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      render: (amount) => (
        <Text type={amount > 0 ? "success" : "secondary"}>₹{amount}</Text>
      ),
      align: 'right',
      width: '15%',
    },
    {
      title: 'Pending',
      dataIndex: 'pendingAmount',
      key: 'pendingAmount',
      render: (amount) => (
        <Text type={amount > 0 ? "danger" : "success"}>₹{amount}</Text>
      ),
      align: 'right',
      width: '15%',
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, record) => {
        const status = record.paymentPercentage === 100 ? 'Paid' : 
                      record.paymentPercentage > 0 ? 'Partial' : 'Pending'
        const color = record.paymentPercentage === 100 ? 'green' : 
                     record.paymentPercentage > 0 ? 'orange' : 'red'
        return <Text style={{ color, fontWeight: 'bold' }}>{status}</Text>
      },
      width: '25%',
    },
  ]

  const totalJoinFees = calculateTotalJoinFees()
  const totalPaid = programPayments.reduce((sum, p) => sum + p.paidAmount, 0)
  const totalPending = programPayments.reduce((sum, p) => sum + p.pendingAmount, 0)
  const paymentProgress = totalJoinFees > 0 ? Math.round((totalPaid / totalJoinFees) * 100) : 0

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      size={800}
      title={
        <div className="flex items-center gap-2">
          <CheckCircleOutlined className="text-green-500" />
          <span>Approve Member Request</span>
        </div>
      }
      footer={
        <div className='flex items-center justify-end gap-2'>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            type="primary" 
            onClick={executeApproval}
            loading={loading}
            icon={<CheckCircleOutlined />}
          >
            Approve Member
          </Button>
        </div>
      }
      maskClosable={!loading}
      closable={!loading}
      destroyOnHidden
    >
      <Spin spinning={loading} indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            joinFeesDone: false,
            paymentMode: 'cash'
          }}
          disabled={loading}
        >
          {selectedMember && (
            <div className="space-y-4">
              {/* Member Summary */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500">Member Name</div>
                    <div className="font-medium">
                      {selectedMember.displayName} {selectedMember.fatherName} {selectedMember.surname}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Current Registration</div>
                    <div className="font-medium text-orange-600">
                      {selectedMember.registrationNumber}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Phone</div>
                    <div>{selectedMember.phone}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Agent</div>
                    <div>{getProgramNames([selectedMember.agentId], programList)}</div>
                  </div>
                </div>
              </div>

              {/* Programs Summary */}
              <div className="border rounded-lg p-4">
                <div className="font-medium mb-2">Selected Programs</div>
                <div className="flex flex-wrap gap-1">
                  {getProgramNames(selectedMember.programIds, programList).map((programName, index) => (
                    <span key={index} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                      {programName}
                    </span>
                  ))}
                </div>
              </div>

              {/* Join Fees Section */}
              <div className="border rounded-lg p-4">
                <div className="font-medium mb-4">Join Fees Information</div>
                
                <Form.Item
                  label="Join Fees Paid?"
                  name="joinFeesDone"
                >
                  <Radio.Group onChange={handleJoinFeesDoneChange}>
                    <Radio value={true}>Yes</Radio>
                    <Radio value={false}>No</Radio>
                  </Radio.Group>
                </Form.Item>

                {joinFeesDone && (
                  <>
                    <Form.Item
                      label="Payment Mode"
                      name="paymentMode"
                    >
                      <Radio.Group onChange={(e) => setPaymentMode(e.target.value)} value={paymentMode}>
                        <Radio value="cash">Cash</Radio>
                        <Radio value="online">Online</Radio>
                      </Radio.Group>
                    </Form.Item>

                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item
                          label="Paid Amount"
                          name="paidAmount"
                          rules={[
                            { required: joinFeesDone, message: 'Please enter paid amount' },
                            {
                              validator: (_, value) => {
                                const totalFees = calculateTotalJoinFees()
                                if (parseFloat(value) > totalFees) {
                                  return Promise.reject(`Amount cannot exceed total fees of ₹${totalFees}`)
                                }
                                return Promise.resolve()
                              }
                            }
                          ]}
                        >
                          <Input 
                            type="number" 
                            placeholder="Enter paid amount" 
                            value={paidAmount}
                            onChange={handlePaidAmountChange}
                            addonBefore="₹"
                            min={0}
                            max={totalJoinFees}
                            step={100}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item label="Total Join Fees">
                          <Input 
                            value={`₹${totalJoinFees}`} 
                            disabled 
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    {paymentMode === 'online' && (
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item
                            label="Transaction ID"
                            name="joinFeesTxtId"
                            rules={[{ required: paymentMode === 'online', message: 'Transaction ID required' }]}
                          >
                            <Input placeholder="Enter transaction/UTR number" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            label="Transaction Date"
                            name="transactionDate"
                            rules={[{ required: paymentMode === 'online', message: 'Transaction date required' }]}
                          >
                            <DatePicker 
                              format="DD-MM-YYYY" 
                              style={{ width: '100%' }} 
                              placeholder="Select date"
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    )}

                    {/* Payment Summary Alert */}
                    {totalJoinFees > 0 && (
                      <Alert
                        title ={`Payment Summary: ₹${totalPaid} paid, ₹${totalPending} pending (${paymentProgress}% complete)`}
                        type={paymentProgress === 100 ? "success" : paymentProgress > 0 ? "warning" : "info"}
                        showIcon
                        className="mb-4"
                      />
                    )}

                    {/* Program-wise Payment Distribution */}
                    {programPayments.length > 0 && (
                      <div className="mt-4">
                        <Text strong style={{ fontSize: '16px', marginBottom: '8px', display: 'block' }}>
                          Program-wise Payment Distribution:
                        </Text>
                        <Table
                          columns={paymentColumns}
                          dataSource={programPayments.map((payment, index) => ({
                            ...payment,
                            key: index
                          }))}
                          rowKey="programId"
                          size="small"
                          pagination={false}
                          className="mt-2"
                          summary={() => (
                            <Table.Summary.Row>
                              <Table.Summary.Cell index={0}>
                                <Text strong>Total</Text>
                              </Table.Summary.Cell>
                              <Table.Summary.Cell index={1} align="right">
                                <Text strong>₹{totalJoinFees}</Text>
                              </Table.Summary.Cell>
                              <Table.Summary.Cell index={2} align="right">
                                <Text strong type="success">₹{totalPaid}</Text>
                              </Table.Summary.Cell>
                              <Table.Summary.Cell index={3} align="right">
                                <Text strong type={totalPending > 0 ? "danger" : "success"}>₹{totalPending}</Text>
                              </Table.Summary.Cell>
                              <Table.Summary.Cell index={4}>
                                <Text strong style={{ 
                                  color: paymentProgress === 100 ? 'green' : paymentProgress > 0 ? 'orange' : 'red'
                                }}>
                                  {paymentProgress}% Complete
                                </Text>
                              </Table.Summary.Cell>
                            </Table.Summary.Row>
                          )}
                        />
                      </div>
                    )}
                  </>
                )}

                {!joinFeesDone && (
                  <Alert
                    title ="No payment will be recorded"
                    description="You have selected that join fees are not paid. The member will be approved with pending payment status."
                    type="info"
                    showIcon
                  />
                )}
              </div>

              {/* Approval Confirmation */}
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-green-500 mt-1" />
                  <div>
                    <div className="font-medium text-green-700">Confirm Approval</div>
                    <div className="text-sm text-green-600">
                      This will activate the member and generate a permanent registration number.
                      {joinFeesDone && ` A payment of ₹${paidAmount} will be recorded.`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Form>
      </Spin>
    </Drawer>
  )
}

export default ApproveModal