import React from 'react'
import { Card, Row, Col, Form, Input, Select } from 'antd'

const GuardianForm = ({ relations }) => {
  return (
    <Card title="Guardian Information" size="small" className="mb-4">
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item
            label="Guardian Name"
            name="guardian"
            rules={[{ required: true, message: 'Please enter guardian name' }]}
          >
            <Input placeholder="Enter guardian name" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            label="Relation with Guardian"
            name="guardianRelation"
            rules={[{ required: true, message: 'Please select relation' }]}
          >
            <Select
              placeholder="Select relation"
              options={relations.map(r => ({ label: r.name, value: r.id }))}
              loading={relations.length === 0}
            />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  )
}

export default GuardianForm