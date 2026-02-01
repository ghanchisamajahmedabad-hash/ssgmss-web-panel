import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  DatePicker,
  Select,
  Table,
  Button,
  Space,
  Progress,
  Tag,
  Divider,
  Empty,
  Spin,
  message,
  Tooltip,
  Modal,
  Input,
  Collapse
} from 'antd';
import {
  DownloadOutlined,
  PrinterOutlined,
  FilterOutlined,
  EyeOutlined,
  DollarOutlined,
  TransactionOutlined,
  CalendarOutlined,
  BarChartOutlined,
  PieChartOutlined,
  LineChartOutlined,
  HistoryOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  ShareAltOutlined,
  InfoCircleOutlined,
  RiseOutlined,
  FallOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { collection, getDocs, query, where } from 'firebase/firestore';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Panel } = Collapse;
const { Search } = Input;

const ExpenseReport = ({ expenses, categories }) => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [reportData, setReportData] = useState([]);
  const [summary, setSummary] = useState({
    totalAmount: 0,
    totalExpenses: 0,
    averageExpense: 0,
    highestExpense: 0,
    lowestExpense: 0,
    dailyAverage: 0
  });
  const [categoryStats, setCategoryStats] = useState([]);
  const [dailyStats, setDailyStats] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);

  // Load report data
  useEffect(() => {
    loadReportData();
  }, [expenses, dateRange, selectedCategory]);

  const loadReportData = async () => {
    setLoading(true);
    try {
      let filteredExpenses = [...expenses];

      // Date filter
      if (dateRange && dateRange.length === 2) {
        const [start, end] = dateRange;
        filteredExpenses = filteredExpenses.filter(expense => {
          const expenseDate = dayjs(expense.date);
          return expenseDate.isAfter(start) && expenseDate.isBefore(end);
        });
      }

      // Category filter
      if (selectedCategory !== 'all') {
        filteredExpenses = filteredExpenses.filter(expense => expense.category === selectedCategory);
      }

      // Calculate summary
      const totalAmount = filteredExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
      const totalExpenses = filteredExpenses.length;
      const averageExpense = totalExpenses > 0 ? totalAmount / totalExpenses : 0;
      const highestExpense = Math.max(...filteredExpenses.map(exp => parseFloat(exp.amount || 0)), 0);
      const lowestExpense = Math.min(...filteredExpenses.map(exp => parseFloat(exp.amount || 0)), Infinity) || 0;
      
      // Days in range
      const daysInRange = dateRange && dateRange.length === 2 
        ? dateRange[1].diff(dateRange[0], 'day') + 1
        : 30;
      const dailyAverage = totalAmount / daysInRange;

      setSummary({
        totalAmount,
        totalExpenses,
        averageExpense,
        highestExpense,
        lowestExpense,
        dailyAverage
      });

      // Calculate category stats
      const categoryMap = {};
      filteredExpenses.forEach(expense => {
        const categoryId = expense.category;
        if (!categoryMap[categoryId]) {
          categoryMap[categoryId] = {
            amount: 0,
            count: 0,
            category: categories.find(c => c.id === categoryId) || {}
          };
        }
        categoryMap[categoryId].amount += parseFloat(expense.amount || 0);
        categoryMap[categoryId].count++;
      });

      const categoryStatsArray = Object.values(categoryMap).map(stat => ({
        ...stat,
        percentage: (stat.amount / totalAmount) * 100
      })).sort((a, b) => b.amount - a.amount);

      setCategoryStats(categoryStatsArray);

      // Daily stats
      const dailyMap = {};
      filteredExpenses.forEach(expense => {
        const date = dayjs(expense.date).format('YYYY-MM-DD');
        if (!dailyMap[date]) {
          dailyMap[date] = {
            date,
            amount: 0,
            count: 0
          };
        }
        dailyMap[date].amount += parseFloat(expense.amount || 0);
        dailyMap[date].count++;
      });

      const dailyArray = Object.values(dailyMap)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      setDailyStats(dailyArray);

      // Monthly trend (last 6 months)
      const monthlyMap = {};
      const sixMonthsAgo = dayjs().subtract(6, 'month');
      
      filteredExpenses.forEach(expense => {
        const monthKey = dayjs(expense.date).format('YYYY-MM');
        const monthDate = dayjs(expense.date);
        
        if (monthDate.isAfter(sixMonthsAgo)) {
          if (!monthlyMap[monthKey]) {
            monthlyMap[monthKey] = {
              month: monthKey,
              amount: 0,
              count: 0
            };
          }
          monthlyMap[monthKey].amount += parseFloat(expense.amount || 0);
          monthlyMap[monthKey].count++;
        }
      });

      // Fill missing months
      const monthlyArray = [];
      for (let i = 5; i >= 0; i--) {
        const month = dayjs().subtract(i, 'month').format('YYYY-MM');
        monthlyArray.push(monthlyMap[month] || {
          month,
          amount: 0,
          count: 0
        });
      }
      setMonthlyTrend(monthlyArray);

      setReportData(filteredExpenses);
    } catch (error) {
      console.error('Error loading report:', error);
      message.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  // Export functions
  const exportToCSV = () => {
    const headers = ['Date', 'Title', 'Category', 'Amount', 'Voucher No', 'Description'];
    const csvData = reportData.map(expense => [
      dayjs(expense.date).format('DD/MM/YYYY'),
      expense.title,
      categories.find(c => c.id === expense.category)?.name || expense.category,
      `₹${parseFloat(expense.amount).toFixed(2)}`,
      expense.voucherNo || 'N/A',
      expense.description || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense_report_${dayjs().format('YYYYMMDD')}.csv`;
    a.click();
    
    message.success('Report exported to CSV');
  };

  const printReport = () => {
    window.print();
  };

  const shareReport = () => {
    Modal.info({
      title: 'Share Report',
      content: (
        <div className="space-y-3">
          <p>Share this report via:</p>
          <Space>
            <Button>Email</Button>
            <Button>Link</Button>
            <Button>PDF</Button>
          </Space>
        </div>
      )
    });
  };

  // Table columns
  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date) => dayjs(date).format('DD MMM YY'),
      sorter: (a, b) => new Date(a.date) - new Date(b.date)
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title'
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (categoryId) => {
        const category = categories.find(c => c.id === categoryId);
        return category ? (
          <Tag color={'#000'}>
            {category.icon} {category.name}
          </Tag>
        ) : '-';
      }
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (amount) => (
        <span className="font-bold text-gray-900">
          ₹{parseFloat(amount).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}
        </span>
      ),
      sorter: (a, b) => parseFloat(a.amount) - parseFloat(b.amount)
    },
    {
      title: 'Voucher',
      dataIndex: 'voucherNo',
      key: 'voucherNo',
      render: (voucher) => (
        <span className="text-blue-600 font-mono">{voucher}</span>
      )
    }
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spin size="large" />
        <span className="ml-4 text-gray-600">Generating report...</span>
      </div>
    );
  }

  return (
    <div className="expense-report p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expense Reports</h1>
          <p className="text-gray-600">
            Analyze and track your spending patterns
          </p>
        </div>
        
        <Space>
          <Tooltip title="Export CSV">
            <Button 
              icon={<FileExcelOutlined />} 
              onClick={exportToCSV}
              className="text-green-600 border-green-200 hover:border-green-400"
            >
              Export
            </Button>
          </Tooltip>
        
        </Space>
      </div>

      {/* Filters */}
      <Card className="mb-6 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <RangePicker
              value={dateRange}
              onChange={setDateRange}
              className="w-full md:w-auto"
              format="DD MMM YYYY"
            />
          </div>
          
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <Select
              value={selectedCategory}
              onChange={setSelectedCategory}
              className="w-full"
              placeholder="All Categories"
            >
              <Option value="all">All Categories</Option>
              {categories.map(cat => (
                <Option key={cat.id} value={cat.id}>
                  <Space>
                    <span style={{ color: cat.color }}>{cat.icon}</span>
                    {cat.name}
                  </Space>
                </Option>
              ))}
            </Select>
          </div>
          
          <div className="flex items-end">
            <Button
              type="primary"
              icon={<FilterOutlined />}
              onClick={loadReportData}
            >
              Apply Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24} sm={12} lg={6}>
          <Card className="shadow-sm">
            <Statistic
              title="Total Spent"
              value={summary.totalAmount}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#3f51b5' }}
              prefix={<DollarOutlined className="text-blue-500" />}
            />
            <div className="mt-2 text-sm text-gray-500">
              {summary.totalExpenses} expenses
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card className="shadow-sm">
            <Statistic
              title="Average Expense"
              value={summary.averageExpense}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#4caf50' }}
              prefix={<TransactionOutlined className="text-green-500" />}
            />
            <div className="mt-2 text-sm text-gray-500">
              Per transaction
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card className="shadow-sm">
            <Statistic
              title="Highest Expense"
              value={summary.highestExpense}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#f44336' }}
              prefix={<RiseOutlined className="text-red-500" />}
            />
            <div className="mt-2 text-sm text-gray-500">
              Largest single expense
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card className="shadow-sm">
            <Statistic
              title="Daily Average"
              value={summary.dailyAverage}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#ff9800' }}
              prefix={<CalendarOutlined className="text-orange-500" />}
            />
            <div className="mt-2 text-sm text-gray-500">
              Per day spending
            </div>
          </Card>
        </Col>
      </Row>

      {/* Category Breakdown */}
      <Card title="Category Breakdown" className="mb-6 shadow-sm">
        {categoryStats.length > 0 ? (
          <div className="space-y-4">
            {categoryStats.map((stat, index) => (
              <div key={stat.category.id || index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Space>
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: stat.category.color }}
                    />
                    <span className="font-medium">{stat.category.name}</span>
                    <Tag color={stat.category.color}>
                      {stat.category.icon}
                    </Tag>
                  </Space>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">
                      ₹{stat.amount.toLocaleString('en-IN', { 
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2 
                      })}
                    </div>
                    <div className="text-sm text-gray-500">
                      {stat.count} expenses
                    </div>
                  </div>
                </div>
                <Progress
                  percent={stat.percentage.toFixed(1)}
                  strokeColor={stat.category.color}
                  showInfo={false}
                />
              </div>
            ))}
          </div>
        ) : (
          <Empty description="No data for selected filters" />
        )}
      </Card>

      {/* Monthly Trend */}
      <Card title="Last 6 Months Trend" className="mb-6 shadow-sm">
        {monthlyTrend.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Month</th>
                  <th className="text-right py-2 px-4">Amount</th>
                  <th className="text-right py-2 px-4">Transactions</th>
                  <th className="text-right py-2 px-4">Average</th>
                </tr>
              </thead>
              <tbody>
                {monthlyTrend.map((month, index) => (
                  <tr key={month.month} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                    <td className="py-2 px-4">
                      <span className="font-medium">
                        {dayjs(month.month).format('MMM YYYY')}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right font-bold">
                      ₹{month.amount.toLocaleString('en-IN', { 
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2 
                      })}
                    </td>
                    <td className="py-2 px-4 text-right">
                      {month.count}
                    </td>
                    <td className="py-2 px-4 text-right">
                      ₹{(month.amount / (month.count || 1)).toLocaleString('en-IN', { 
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2 
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty description="No monthly data available" />
        )}
      </Card>

      {/* Detailed Expense Table */}
      <Card 
        title={`Expense Details (${reportData.length} records)`} 
        className="shadow-sm"
        extra={
          <Space>
            <span className="text-gray-600 text-sm">
              Showing data from {dateRange[0]?.format('DD MMM YYYY')} to {dateRange[1]?.format('DD MMM YYYY')}
            </span>
          </Space>
        }
      >
        {reportData.length > 0 ? (
          <>
            <Table
              columns={columns}
              dataSource={reportData}
              rowKey="id"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} expenses`
              }}
              size="middle"
              scroll={{ x: 800 }}
            />
            
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-medium text-gray-700">Report Summary:</span>
                  <div className="text-sm text-gray-600 mt-1">
                    Period: {dateRange[0]?.format('DD MMM YYYY')} - {dateRange[1]?.format('DD MMM YYYY')}
                    {selectedCategory !== 'all' && ` | Category: ${categories.find(c => c.id === selectedCategory)?.name}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-gray-900">
                    ₹{summary.totalAmount.toLocaleString('en-IN', { 
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2 
                    })}
                  </div>
                  <div className="text-sm text-gray-600">
                    Total for {summary.totalExpenses} expenses
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <Empty
            description={
              <div className="text-center py-8">
                <p className="text-gray-600 mb-2">No expense data found</p>
                <p className="text-gray-500 text-sm">Try adjusting your filters</p>
              </div>
            }
          />
        )}
      </Card>

      {/* Print Styles */}
      <style jsx>{`
        @media print {
          .expense-report {
            padding: 0;
          }
          .ant-card {
            box-shadow: none !important;
            border: 1px solid #ddd !important;
            page-break-inside: avoid;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ExpenseReport;