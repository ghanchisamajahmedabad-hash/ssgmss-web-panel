"use client";
import React, { useEffect, useState } from 'react';
import { Layout, Input, Badge, Avatar, Button, Space, Drawer, Dropdown } from 'antd';
import {
  SearchOutlined,
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  MailOutlined,
  ProfileOutlined,
} from '@ant-design/icons';
import { useAuth } from './AuthProvider';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../../lib/firbase-client';
import { deleteDoc, doc, onSnapshot } from 'firebase/firestore';

const { Header } = Layout;

const TopBar = ({ collapsed, setCollapsed }) => {
  const { user } = useAuth();
  const router = useRouter();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const logout=async()=>{
    await signOut(auth);
    router.replace('/auth/login');
  }
  const handleLogout = async () => {
    try {
      // Remove session from Firestore before logout
      const userId = user?.uid;
      const sessionToken = localStorage.getItem("session_token");
      if (userId && sessionToken) {
        await deleteDoc(doc(db, "users", userId, "sessions", sessionToken));
      }
      logout()
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };
  // Mock notifications data
  const notifications = [
    {
      id: 1,
      title: 'New Match Request',
      description: 'Sarah Johnson sent you a match request',
      time: '5 min ago',
      unread: true,
    },
    {
      id: 2,
      title: 'Profile Approved',
      description: 'Your profile has been approved and is now live',
      time: '1 hour ago',
      unread: true,
    },
    {
      id: 3,
      title: 'New Message',
      description: 'You have a new message from Michael Brown',
      time: '2 hours ago',
      unread: false,
    },
  ];

  const unreadCount = notifications.filter((n) => n.unread).length;

  // User menu items
  const userMenuItems = [
    {
      key: 'profile',
      icon: <ProfileOutlined />,
      label: 'My Profile',
      onClick: () => router.push('/profile'),
    },
    {
      key: 'messages',
      icon: <MailOutlined />,
      label: 'Messages',
      onClick: () => router.push('/messages'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: () => router.push('/settings'),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      danger: true,
      onClick: handleLogout,
    },
  ];



  // Handle search
  const handleSearch = (value) => {
    console.log('Search:', value);
    // Implement search functionality
  };

  // Handle add program
  const handleAddProgram = () => {
    router.push('/programs/yojnas/add-yojna');
  };
    useEffect(() => {
    const userId = user?.uid;
    const sessionToken = localStorage.getItem("session_token");
    const sessionRef = doc(db, "users", userId, "sessions", sessionToken);
    const unsubscribe = onSnapshot(sessionRef, (doc) => {
      if (!doc.exists()) {
        logout()
      }
    });
  
    return unsubscribe;
  }, []);

  return (
    <>
      <Header
        className="!bg-surface shadow-md !px-6 flex items-center justify-between border-b border-[var(--border)] sticky top-0 z-50"
        style={{
          height: '64px',
          lineHeight: '64px',
          padding: '0 24px',
        }}
      >
        {/* Left Section - Toggle & Search */}
        <div className="flex items-center gap-4 flex-1">
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            className="!text-[var(--foreground)] hover:!text-[var(--primary)] hover:!bg-[rgba(219,39,119,0.05)] !h-10 !w-10"
          />

          <Input
            placeholder="Search profiles, members, events..."
            prefix={<SearchOutlined className="text-[var(--muted-foreground)]" />}
            className="!max-w-md !h-10 !rounded-lg !border-[var(--border)] focus:!border-[var(--primary)] hover:!border-[var(--border-hover)]"
            onPressEnter={(e) => handleSearch(e.target.value)}
            style={{
              background: 'var(--surface-secondary)',
            }}
          />
        </div>

        {/* Right Section - Actions & User */}
        <Space size="middle" className="flex items-center">
          {/* Add Program Button */}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddProgram}
            className="!h-10 !rounded-lg !font-semibold gradient-primary !border-none hover:!opacity-90 !shadow-md"
            style={{
              background: 'var(--gradient-primary)',
            }}
          >
            <span className="hidden sm:inline">Add Yojna</span>
          </Button>

          {/* Notifications */}
          <Badge count={unreadCount} offset={[-5, 5]}>
            <Button
              type="text"
              icon={<BellOutlined className="text-xl" />}
              onClick={() => setNotificationOpen(true)}
              className="!text-[var(--foreground)] hover:!text-[var(--primary)] hover:!bg-[rgba(219,39,119,0.05)] !h-10 !w-10 flex items-center justify-center"
            />
          </Badge>

          {/* User Dropdown */}
          <Dropdown
            menu={{ items: userMenuItems }}
            trigger={['click']}
            placement="bottomRight"
          >
            <div className="flex items-center gap-3 cursor-pointer px-3 py-2 rounded-lg hover:bg-[rgba(219,39,119,0.05)] transition-all">
              <Avatar
                size={40}
                icon={<UserOutlined />}
                className="!bg-gradient-primary"
                style={{
                  background: 'var(--gradient-primary)',
                }}
              />
              <div className="hidden md:block text-left">
                <div className="text-sm capitalize font-semibold text-[var(--foreground)] leading-tight">
                  {user?.name || 'Admin User'}
                </div>
                <div className="text-xs capitalize text-[var(--muted-foreground)] leading-tight">
                  {user?.role || 'Administrator'}
                </div>
              </div>
            </div>
          </Dropdown>
        </Space>
      </Header>

      {/* Notifications Drawer */}
      <Drawer
        title={
          <div className="flex items-center justify-between">
            <span className="text-[var(--foreground)] font-semibold">Notifications</span>
            <Badge count={unreadCount} className="mr-2" />
          </div>
        }
        placement="right"
        onClose={() => setNotificationOpen(false)}
        open={notificationOpen}
        size={400}
      >
        <div className="space-y-4">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                notification.unread
                  ? 'bg-[rgba(219,39,119,0.05)] border-[var(--primary-light)]'
                  : 'bg-[var(--surface-secondary)] border-[var(--border)]'
              } hover:shadow-md`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-2 h-2 rounded-full mt-2 ${
                    notification.unread ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
                  }`}
                />
                <div className="flex-1">
                  <h4 className="font-semibold text-[var(--foreground)] mb-1">
                    {notification.title}
                  </h4>
                  <p className="text-sm text-[var(--foreground-secondary)] mb-2">
                    {notification.description}
                  </p>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {notification.time}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <Button
            type="link"
            className="!text-[var(--primary)] hover:!text-[var(--primary-dark)]"
          >
            View All Notifications
          </Button>
        </div>
      </Drawer>

      <style jsx global>{`
        .ant-layout-header {
          background: var(--surface) !important;
          border-bottom: 1px solid var(--border) !important;
        }

        .ant-btn-primary {
          box-shadow: var(--shadow-md) !important;
        }

        .ant-btn-primary:hover {
          opacity: 0.9 !important;
          box-shadow: var(--shadow-lg) !important;
        }

        .ant-dropdown-menu {
          background: var(--surface) !important;
          border: 1px solid var(--border) !important;
          box-shadow: var(--shadow-lg) !important;
          border-radius: 8px !important;
          padding: 8px !important;
        }

        .ant-dropdown-menu-item {
          border-radius: 6px !important;
          color: var(--foreground-secondary) !important;
        }

        .ant-dropdown-menu-item:hover {
          background: rgba(219, 39, 119, 0.05) !important;
          color: var(--primary) !important;
        }

        .ant-dropdown-menu-item-danger:hover {
          background: rgba(220, 38, 38, 0.05) !important;
          color: var(--error) !important;
        }

        .ant-badge-count {
          background: var(--primary) !important;
          box-shadow: var(--shadow-sm) !important;
        }

        .ant-drawer-header {
          background: var(--surface) !important;
          border-bottom: 1px solid var(--border) !important;
        }

        .ant-drawer-body {
          background: var(--background) !important;
        }

        .ant-drawer-title {
          color: var(--foreground) !important;
        }

        .ant-input {
          background: var(--surface-secondary) !important;
          border-color: var(--border) !important;
          color: var(--foreground) !important;
        }

        .ant-input:hover {
          border-color: var(--border-hover) !important;
        }

        .ant-input:focus,
        .ant-input-focused {
          border-color: var(--primary) !important;
          box-shadow: 0 0 0 2px rgba(219, 39, 119, 0.1) !important;
        }

        .ant-input::placeholder {
          color: var(--muted-foreground) !important;
        }
      `}</style>
    </>
  );
};

export default TopBar;