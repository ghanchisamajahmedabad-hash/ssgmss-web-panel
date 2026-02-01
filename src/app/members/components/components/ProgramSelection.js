import React, { useEffect } from 'react'
import { Card, Row, Col, Form, DatePicker, Select, Alert, Typography, Table } from 'antd'
import dayjs from 'dayjs'

const { Text } = Typography

const ProgramSelection = ({ 
  joinDate, 
  handleJoinDateChange, 
  programs, 
  selectedPrograms, 
  handleProgramChange,
  dobDate,
  programDetails,
  calculateTotalJoinFees,
  isEditMode = false
}) => {
  const programManu = programs?.map((item) => ({
    label: item.name,
    value: item.id
  })) || []
console.log(programDetails,'programDetails')
  const programDetailColumns = [
    {
      title: 'Program',
      dataIndex: 'programName',
      key: 'programName',
    },
    {
      title: 'Age Group',
      dataIndex: 'ageGroupName',
      key: 'ageGroupName',
      render: (text, record) => text || record.ageRange || '-',
    },
    {
      title: 'On Join Fees',
      dataIndex: 'joinFees',
      key: 'joinFees',
      render: (fees) => fees ? `₹${fees}` : '-',
    },
     {
      title: 'Fixed Join Fees',
      dataIndex: 'fixedJoinFees',
      key: 'fixedJoinFees',
      render: (fees) => fees ? `₹${fees}` : '-',
    },
    {
      title: 'Pay Amount',
      dataIndex: 'payAmount',
      key: 'payAmount',
      render: (amount) => amount ? `₹${amount}` : '-',
    },
    {
      title: 'Period',
      key: 'period',
      render: (_, record) => 
        record.periodStartDate && record.periodEndDate 
          ? `${record.periodStartDate} to ${record.periodEndDate}` 
          : '-',
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, record) => 
        record.error ? (
          <span style={{ color: 'red' }}>Error</span>
        ) : record.hasPeriod ? (
          <span style={{ color: 'green' }}>Active</span>
        ) : (
          <span style={{ color: 'orange' }}>No Period</span>
        ),
    },
  ]

  // Debug logging
  useEffect(() => {
    console.log('ProgramSelection props:', {
      selectedPrograms,
      dobDate: dobDate?.format('DD-MM-YYYY'),
      programDetailsCount: programDetails?.length,
      programsCount: programs?.length
    })
  }, [selectedPrograms, dobDate, programDetails, programs])

  return (
    <Card title="Join Date & Program Selection" size="small" className="mb-4">
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label="Join Date"
            name="joinDate"
            rules={[{ required: true, message: 'Please select join date' }]}
          >
            <DatePicker
              format="DD-MM-YYYY"
              style={{ width: '100%' }}
              value={joinDate}
              onChange={handleJoinDateChange}
              disabledDate={(current) => current && current > dayjs().endOf('day')}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label="Select Programs"
            name="programs"
            rules={[{ required: true, message: 'Please select at least one program' }]}
          >
            <Select
              mode="multiple"
              placeholder="Select programs"
              options={programManu}
              onChange={handleProgramChange}
              value={selectedPrograms}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
      </Row>

      {selectedPrograms.length > 0 && dobDate && programDetails.length > 0 ? (
        <div className="mt-4">
          <Alert
            title="Program Details"
            description={
              <div>
                <Table
                  columns={programDetailColumns}
                  dataSource={programDetails}
                  rowKey="programId"
                  size="small"
                  pagination={false}
                />
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <Text strong>Total Join Fees:</Text>
                    <Text strong>₹{calculateTotalJoinFees()}</Text>
                  </div>
                  {programDetails.some(p => p.error) && (
                    <Alert
                      title="Errors Detected"
                      description={
                        <ul>
                          {programDetails.filter(p => p.error).map((p, idx) => (
                            <li key={idx} style={{ color: 'red' }}>{p.error}</li>
                          ))}
                        </ul>
                      }
                      type="error"
                      showIcon
                      className="mt-2"
                    />
                  )}
                </div>
              </div>
            }
            type="info"
            showIcon
          />
        </div>
      ) : selectedPrograms.length > 0 && !dobDate ? (
        <Alert
          title="Date of Birth Required"
          description="Please select Date of Birth to calculate program fees"
          type="warning"
          showIcon
          className="mt-4"
        />
      ) : selectedPrograms.length === 0 ? (
        <Alert
          title="No Programs Selected"
          description="Please select at least one program"
          type="info"
          showIcon
          className="mt-4"
        />
      ) : null}
    </Card>
  )
}

export default ProgramSelection