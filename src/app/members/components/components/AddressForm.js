import React from 'react'
import { Card, Row, Col, Form, Input, Select } from 'antd'

const AddressForm = ({ 
  states, 
  districts, 
  cities, 
  selectedState, 
  selectedDistrict, 
  handleStateChange, 
  handleDistrictChange,
  form 
}) => {
  return (
    <Card title="Address Information" size="small" className="mb-4">
      <Row gutter={16}>
        <Col span={24}>
          <Form.Item
            label="Current Address"
            name="currentAddress"
            rules={[{ required: true, message: 'Please enter address' }]}
          >
            <Input.TextArea rows={2} placeholder="Enter complete address" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={8}>
          <Form.Item
            label="State"
            name="state"
            rules={[{ required: true, message: 'Please select state' }]}
          >
            <Select
              placeholder="Select state"
              options={states.map(s => ({ label: s.name, value: s.id }))}
              loading={states.length === 0}
              onChange={handleStateChange}
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            label="District"
            name="district"
            rules={[{ required: true, message: 'Please select district' }]}
          >
            <Select
              placeholder="Select district"
              options={districts.map(d => ({ label: d.name, value: d.id }))}
              loading={districts.length === 0 && selectedState !== null}
              disabled={!selectedState}
              onChange={handleDistrictChange}
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            label="City"
            name="city"
            rules={[{ required: true, message: 'Please select city' }]}
          >
            <Select
              placeholder="Select city"
              options={cities.map(c => ({ label: c.name, value: c.id }))}
              loading={cities.length === 0 && selectedDistrict !== null}
              disabled={!selectedDistrict}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label="Pin Code"
            name="pinCode"
            rules={[
              { required: true, message: 'Please enter pin code' },
              { pattern: /^[0-9]{6}$/, message: 'Please enter valid 6-digit pin code' }
            ]}
          >
            <Input placeholder="Enter pin code" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label="Village"
            name="village"
            rules={[{ required: true, message: 'Please enter village' }]}
          >
            <Input placeholder="Enter village" />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  )
}

export default AddressForm