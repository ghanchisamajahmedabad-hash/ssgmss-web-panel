import { Form, Input, message, Modal } from 'antd'
import React, { useState } from 'react'
import { 
 CloseCircleOutlined

} from '@ant-design/icons'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../../../lib/firbase-client'
const RejectModal = ({open,setOpen,selectedMember,setSelectedMember,getProgramNames,fetchAllData,programList,user }) => {

  const [rejectionReason, setRejectionReason] = useState('')
  const [isLoading,setIsLoading]=useState(false)
    console.log(user,"user")

  const executeRejection = async () => {
    if (!selectedMember || !rejectionReason.trim()) {
      message.error('Please provide a rejection reason')
      return
    }
    try {
        setIsLoading(true)
      await updateDoc(doc(db, 'members', selectedMember.id), {
        status: 'rejected',
        active_flag: false,
        rejectionReason: rejectionReason.trim(),
        rejectedBy: user?.uid,
        rejectedByName: user?.name || user?.email,
        rejectedAt: serverTimestamp(),
        updated_at: serverTimestamp()
      })
      
      message.success('Member request rejected')
      setIsLoading(false)
      setOpen(false)
      setRejectionReason('')
      setSelectedMember(null)
      fetchAllData()
    } catch (error) {
      console.error('Error rejecting member:', error)
      message.error('Failed to reject member request')
    }
  }

  return (
    <div>
         <Modal
        title="Reject Member Request"
        open={open}
        onOk={executeRejection}
       okButtonProps={{
        loading:isLoading
       }}
        onCancel={() => {
          setOpen(false)
          setRejectionReason('')
        //   setSelectedMember(null)
        }}
        okText="Reject"
        okType="danger"
        cancelText="Cancel"
      >
        {selectedMember && (
          <div>
            <div className="flex items-center gap-3 mb-4 p-3 bg-red-50 rounded">
              <CloseCircleOutlined className="text-red-500 text-xl" />
              <div>
                <div className="font-medium">Confirm Rejection</div>
                <div className="text-sm text-gray-600">
                  Please provide a reason for rejecting this member request
                </div>
              </div>
            </div>
            
            <div className="mb-4">
              <div><strong>Member:</strong> {selectedMember.displayName}</div>
              <div><strong>Registration:</strong> {selectedMember.registrationNumber}</div>
              <div><strong>Programs:</strong> {getProgramNames(selectedMember.programIds, programList).join(', ')}</div>
            </div>
            
            <Form layout="vertical">
              <Form.Item label="Rejection Reason" required>
                <Input.TextArea
                  rows={3}
                  placeholder="Enter reason for rejection..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  maxLength={500}
                  showCount
                />
              </Form.Item>
            </Form>
            
            <div className="text-gray-500 text-sm">
              Note: Rejected members can be restored from the rejected members section.
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default RejectModal
