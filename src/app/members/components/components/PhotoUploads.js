import React, { useState } from 'react'
import { Card, Row, Col, Form, Button, Upload, Avatar, Space } from 'antd'
import { UploadOutlined, UserOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { message } from 'antd'
import ImgCrop from 'antd-img-crop'

const PhotoUploads = ({ 
  memberPhoto, 
  setMemberPhoto, 
  guardianPhoto, 
  setGuardianPhoto,
  existingMemberPhoto,
  existingGuardianPhoto,
  isEditMode = false
}) => {
  const [memberFileList, setMemberFileList] = useState([])
  const [guardianFileList, setGuardianFileList] = useState([])

  // Convert existing photos to fileList format
  React.useEffect(() => {
    if (existingMemberPhoto && !memberPhoto) {
      setMemberFileList([{
        uid: '-1',
        name: 'existing_member.jpg',
        status: 'done',
        url: existingMemberPhoto,
        preview: existingMemberPhoto
      }])
    }
  }, [existingMemberPhoto, memberPhoto])

  React.useEffect(() => {
    if (existingGuardianPhoto && !guardianPhoto) {
      setGuardianFileList([{
        uid: '-2',
        name: 'existing_guardian.jpg',
        status: 'done',
        url: existingGuardianPhoto,
        preview: existingGuardianPhoto
      }])
    }
  }, [existingGuardianPhoto, guardianPhoto])

  // Handle member photo change
const handleMemberChange = ({ fileList }) => {
    const updatedList = fileList.map((file) => {
      if (file.originFileObj && !file.url && !file.preview) {
        file.preview = URL.createObjectURL(file.originFileObj)
      }
      return file
    })
    
    setMemberFileList(updatedList)
    
    if (updatedList.length > 0) {
      const file = updatedList[0]
      if (file.originFileObj) {
        // Set the actual File object
        setMemberPhoto(file.originFileObj)
      } else if (file.url && !file.originFileObj) {
        // This is an existing photo URL
        setMemberPhoto(file.url)
      }
    } else {
      setMemberPhoto(null)
    }
  }

  // Handle guardian photo change
  const handleGuardianChange = ({ fileList }) => {
    const updatedList = fileList.map((file) => {
      if (file.originFileObj && !file.url && !file.preview) {
        file.preview = URL.createObjectURL(file.originFileObj)
      }
      return file
    })
    
    setGuardianFileList(updatedList)
    
    if (updatedList.length > 0) {
      const file = updatedList[0]
      if (file.originFileObj) {
        // Set the File object directly
        setGuardianPhoto(file.originFileObj)
      } else if (file.url && !file.originFileObj) {
        // This is an existing photo URL
        setGuardianPhoto(file.url)
      }
    } else {
      setGuardianPhoto(null)
    }
  }

  // Handle preview
  const handlePreview = async (file) => {
    if (file.url) {
      window.open(file.url, '_blank')
    } else if (file.preview) {
      const image = new Image()
      image.src = file.preview
      const imgWindow = window.open('')
      imgWindow?.document.write(image.outerHTML)
    }
  }

  // Remove photo handler
  const handleRemovePhoto = (type) => {
    if (type === 'member') {
      setMemberFileList([])
      setMemberPhoto(null)
      message.success('Member photo removed!')
    } else {
      setGuardianFileList([])
      setGuardianPhoto(null)
      message.success('Guardian photo removed!')
    }
  }

  // Get current photo for avatar
  const getCurrentPhoto = (type) => {
    if (type === 'member') {
      if (memberPhoto?.preview) return memberPhoto.preview
      if (memberPhoto?.file) return URL.createObjectURL(memberPhoto.file)
      if (existingMemberPhoto && !memberPhoto) return existingMemberPhoto
      return null
    } else {
      if (guardianPhoto?.preview) return guardianPhoto.preview
      if (guardianPhoto?.file) return URL.createObjectURL(guardianPhoto.file)
      if (existingGuardianPhoto && !guardianPhoto) return existingGuardianPhoto
      return null
    }
  }

  return (
    <Card 
      title="Photo Uploads" 
      size="small" 
      className="mb-4"
      extra={<span className="text-xs text-gray-500">Recommended: Square photos (1:1 ratio)</span>}
    >
      <Row gutter={[24, 16]}>
        {/* Member Photo Column */}
        <Col xs={24} md={12}>
          <Form.Item 
            label="Member Photo" 
            required={!isEditMode}
            validateStatus={memberFileList.length > 0 ? 'success' : ''}
            help={memberFileList.length > 0 ? "Photo ready for submission" : "Please upload member photo"}
          >
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              
                
                {/* Upload and Actions */}
                <div className="flex flex-col gap-2 flex-grow">
                  <Space orientation="vertical" size="small" className="w-full">
                    {/* Upload with Crop */}
                    <ImgCrop 
                      rotate 
                      showGrid 
                      rotationSlider 
                      aspectSlider 
                      showReset
                      modalTitle="Crop Member Photo"
                      modalWidth={800}
                      modalOk="Save"
                      modalCancel="Cancel"
                      quality={1}
                      fillColor="transparent"
                    >
                      <Upload
                        listType="picture-card"
                        multiple={false}
                        maxCount={1}
                        fileList={memberFileList}
                        onChange={handleMemberChange}
                        onPreview={handlePreview}
                        accept="image/*"
                      >
                        {memberFileList.length === 0 && (
                          <div>
                            <PlusOutlined />
                            <div style={{ marginTop: 8 }}>Upload</div>
                          </div>
                        )}
                      </Upload>
                    </ImgCrop>
                    
                    {/* Remove Button */}
                    
                  </Space>
                  
                  {/* File Info */}
                  {memberPhoto && (
                    <div className="text-xs text-gray-500 mt-2">
                      <div className="truncate">
                        <strong>File:</strong> {memberPhoto.name || 'Uploaded Photo'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Status Message */}
           
            </div>
          </Form.Item>
        </Col>
        
        {/* Guardian Photo Column */}
        <Col xs={24} md={12}>
          <Form.Item 
            label="Guardian Photo" 
            required={!isEditMode}
            validateStatus={guardianFileList.length > 0 ? 'success' : ''}
            help={guardianFileList.length > 0 ? "Photo ready for submission" : "Please upload guardian photo"}
          >
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                {/* Existing or Current Photo */}
              
                {/* Upload and Actions */}
                <div className="flex flex-col gap-2 flex-grow">
                  <Space orientation="vertical" size="small" className="w-full">
                    {/* Upload with Crop */}
                    <ImgCrop 
                      rotate 
                      showGrid 
                      rotationSlider 
                      aspectSlider 
                      showReset
                      modalTitle="Crop Guardian Photo"
                      modalWidth={800}
                      modalOk="Save"
                      modalCancel="Cancel"
                      quality={1}
                      fillColor="transparent"
                    >
                      <Upload
                        listType="picture-card"
                        multiple={false}
                        maxCount={1}
                        fileList={guardianFileList}
                        onChange={handleGuardianChange}
                        onPreview={handlePreview}
                        accept="image/*"
                      >
                        {guardianFileList.length === 0 && (
                          <div>
                            <PlusOutlined />
                            <div style={{ marginTop: 8 }}>Upload</div>
                          </div>
                        )}
                      </Upload>
                    </ImgCrop>
                    
                    {/* Remove Button */}
                  
                  </Space>
                  
                  {/* File Info */}
                  {guardianPhoto && (
                    <div className="text-xs text-gray-500 mt-2">
                      <div className="truncate">
                        <strong>File:</strong> {guardianPhoto.name || 'Uploaded Photo'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Status Message */}
             
            </div>
          </Form.Item>
        </Col>
      </Row>
      

    </Card>
  )
}

export default PhotoUploads