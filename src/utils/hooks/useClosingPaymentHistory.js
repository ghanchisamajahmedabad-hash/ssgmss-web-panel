import { useState } from 'react';
import { message } from 'antd';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../../lib/firbase-client';


export const useClosingPaymentHistory = () => {
  const [paymentGroups, setPaymentGroups] = useState([]);
  const [paymentTransactions, setPaymentTransactions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchPaymentGroups = async (agentId) => {
    if (!agentId) return;
    
    setHistoryLoading(true);
    try {
      // Fetch payment groups
      const groupsQuery = query(
        collection(db, 'paymentGroups'),
        where('agentId', '==', agentId),
        where('paymentType', '==', 'closingPayment'), 
        orderBy('createdAt', 'desc'),
      );
      const groupsSnapshot = await getDocs(groupsQuery);
      const groups = [];
      
      for (const groupDoc of groupsSnapshot.docs) {
        const groupData = { id: groupDoc.id, ...groupDoc.data() };
        
        // Fetch transactions for this group
        const transactionsQuery = query(
          collection(db, 'memberClosingFees'),
          where('groupId', '==', groupDoc.id)
        );
        const transactionsSnapshot = await getDocs(transactionsQuery);
        const transactions = transactionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        groups.push({
          ...groupData,
          transactions
        });
      }
      
      setPaymentGroups(groups);
      
      // Flatten all transactions for timeline view
      const allTransactions = groups.flatMap(group => 
        group.transactions.map(t => ({
          ...t,
          groupId: group.id,
          paymentDate: group.paymentDate,
          paymentMethod: group.paymentMethod,
          transactionId: group.transactionId
        }))
      );
      setPaymentTransactions(allTransactions);
      
    } catch (error) {
      console.error('Error fetching payment history:', error);
      message.error('Failed to load payment history');
    } finally {
      setHistoryLoading(false);
    }
  };

  return {
    paymentGroups,
    paymentTransactions,
    historyLoading,
    fetchPaymentGroups
  };
};