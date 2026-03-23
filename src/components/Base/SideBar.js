// components/Base/SideBar.tsx
"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Menu, Tooltip, Modal } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  TeamOutlined,
  HeartOutlined,
  SettingOutlined,
  CreditCardOutlined,
  DatabaseOutlined,
  UserSwitchOutlined,
  AppstoreOutlined,
  LockOutlined,
  TagOutlined,
  InboxOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { sideBarStyle } from '@/constent/antdTheme';
import { onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firbase-client';

const { Sider } = Layout;

// ─── Permission helpers ────────────────────────────────────────────────────────

const isSuperAdmin = (user) => user?.role === 'superadmin';

const hasPageAccess = (user, pageKey) => {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
console.log(user.permissions,'user.permissions')
  const pages = user.permissions?.pages || [];
  if (pages.includes(pageKey)) return true;

  // Exact match only — '/programs' does NOT grant access to '/programs/yojnas'
  return false;
};

const hasModuleAccess = (user, moduleKey) => {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return user.permissions?.moduleAccess?.[moduleKey] === true;
};

const anyChildAccessible = (user, item) => {
  if (!item) return false;
  if (item.key && hasPageAccess(user, item.key)) return true;
  if (item.children) return item.children.some(c => anyChildAccessible(user, c));
  return false;
};

// ─── Menu definition ───────────────────────────────────────────────────────────

const buildMenuItems = (user, pendingCount, collapsed) => {
  const label = (text) => collapsed ? null : text;

  const ALL_ITEMS = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: label('Dashboard'),
      module: 'dashboard',
    },
    {
      key: '/programs',
      icon: <AppstoreOutlined />,
      label: label('Programs'),
      module: 'programs',
      children: [
        { key: '/programs/closing-forms', label: 'Closing Forms', module: 'programs' },
        { key: '/programs/yojnas', label: 'Yojnas', module: 'programs' },
      ],
    },
    {
      key: '/agents',
      icon: <UserSwitchOutlined />,
      label: label('Agents'),
      module: 'agents',
    },
    {
      key: '/members',
      icon: <TeamOutlined />,
      label: label('Members'),
      module: 'members',
    },
    {
      key: '/requests',
      icon: <InboxOutlined />,
      label: collapsed ? null : (
        <div className='flex items-center gap-2'>
          Requests
          {pendingCount > 0 && (
            <span className='bg-pink-600 font-bold text-[13px] text-white flex items-center justify-center rounded-full h-[22px] min-w-[22px] px-1 text-center'>
              {pendingCount}
            </span>
          )}
        </div>
      ),
      module: 'requests',
    },
    {
      key: '/payments',
      icon: <CreditCardOutlined />,
      label: label('Payments'),
      module: 'payments',
      children: [
        { key: '/payments/join-fees', label: 'Join Fees', module: 'payments' },
        { key: '/payments/closing-payment', label: 'Closing Payment', module: 'payments' },
      ],
    },
    {
      key: '/master',
      icon: <DatabaseOutlined />,
      label: label('Master'),
      module: 'master',
      children: [
        { key: '/master/users', label: 'Users', module: 'master' },
        { key: '/master/state', label: 'State', module: 'master' },
        { key: '/master/district', label: 'District', module: 'master' },
        { key: '/master/city', label: 'City', module: 'master' },
        { key: '/master/cast', label: 'Cast', module: 'master' },
        { key: '/master/relations', label: 'Relations', module: 'master' },
      ],
    },
    {
      key: '/expenses',
      icon: <TagOutlined />,
      label: label('Expenses'),
      module: 'expenses',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: label('Settings'),
      module: 'settings',
      children: [
        { key: '/settings/about', label: 'About', module: 'settings' },
        { key: '/settings/contact', label: 'Contact', module: 'settings' },
        {
          key: '/settings/security',
          label: 'Security',
          module: 'settings',
          children: [
            { key: '/settings/security/change-password', label: 'Password Change', module: 'settings' },
            { key: '/settings/security/sessions', label: 'Sessions', module: 'settings' },
          ],
        },
      ],
    },
    {
      key: '/trash',
      icon: <DeleteOutlined />,
      label: label('Trash'),
      module: 'trash',
    },
  ];

  if (isSuperAdmin(user)) return ALL_ITEMS;

  // Filter recursively
  const filterItem = (item) => {
    if (item.children) {
      const filteredChildren = item.children
        .map(filterItem)
        .filter(Boolean);

      // Show parent only if it has at least one accessible child
      if (filteredChildren.length > 0) {
        return { ...item, children: filteredChildren };
      }
      return null;
    }

    // Leaf node — only exact page permission, never module-level
    if (hasPageAccess(user, item.key)) {
      return item;
    }
    return null;
  };

  return ALL_ITEMS.map(filterItem).filter(Boolean);
};

// ─── Component ─────────────────────────────────────────────────────────────────

const SideBar = ({ collapsed, setCollapsed }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [openKeys, setOpenKeys] = useState([]);
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  // Compute open keys based on current path
  const defaultOpenKeys = useMemo(() => {
    const keys = [];
    const check = (items) => {
      for (const item of items) {
        if (item.children) {
          const hasActive = item.children.some(c => pathname.startsWith(c.key));
          if (hasActive || pathname.startsWith(item.key + '/')) {
            keys.push(item.key);
          }
          check(item.children);
        }
      }
    };
    check(buildMenuItems(user, pendingCount, collapsed));
    return keys;
  }, [pathname, user]);

  useEffect(() => {
    if (!collapsed) {
      setOpenKeys(defaultOpenKeys);
    } else {
      setOpenKeys([]);
    }
  }, [pathname, collapsed, user]);

  // Real-time pending count listener
  useEffect(() => {
    if (!user) return;
    const membersRef = collection(db, 'members');
    const q = user.role === 'agent'
      ? query(membersRef, where('status', '==', 'pending_approval'), where('agentId', '==', user.uid), where('delete_flag', '!=', true))
      : query(membersRef, where('status', '==', 'pending_approval'), where('delete_flag', '!=', true));

    const unsub = onSnapshot(q, (snap) => setPendingCount(snap.size), console.error);
    return unsub;
  }, [user]);

  const menuItems = useMemo(
    () => buildMenuItems(user, pendingCount, collapsed),
    [user, pendingCount, collapsed]
  );

  const handleMenuClick = ({ key }) => {
    if (!hasPageAccess(user, key) && !isSuperAdmin(user)) {
      Modal.error({
        title: 'Access Denied',
        content: 'You do not have permission to access this page.',
      });
      return;
    }
    router.push(key);
  };

  const siderStyle = {
    overflow: 'auto',
    height: '100vh',
    position: 'fixed',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 100,
    background: '#ffffff',
    borderRight: '1px solid #fde2d8',
    boxShadow: '2px 0 8px rgba(219, 39, 119, 0.04)',
  };

  if (!user) {
    return (
      <Sider collapsed={collapsed} collapsedWidth={80} width={280} className="sidebar-custom" style={siderStyle}>
        <div className="sidebar-header">
          <div className={`logo-container ${collapsed ? 'collapsed' : ''}`}>
            {!collapsed ? (
              <div className="logo-content">
                <div className="logo-icon"><HeartOutlined /></div>
                <div className="logo-text">
                  <h1 className="logo-title">SSGMSSS TRUST</h1>
                  <p className="logo-subtitle">Loading...</p>
                </div>
              </div>
            ) : (
              <Tooltip title="SSGMSSS TRUST" placement="right">
                <div className="logo-icon collapsed"><HeartOutlined /></div>
              </Tooltip>
            )}
          </div>
        </div>
      </Sider>
    );
  }

  const roleLabel = {
    superadmin: 'Super Admin',
    admin: 'Admin Portal',
    agent: 'Agent Portal',
  }[user.role] || 'Member Portal';

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      breakpoint="lg"
      collapsedWidth={80}
      width={280}
      trigger={null}
      className="sidebar-custom"
      style={siderStyle}
    >
      {/* Logo */}
      <div className="sidebar-header">
        <div className={`logo-container ${collapsed ? 'collapsed' : ''}`}>
          {!collapsed ? (
            <div className="logo-content">
              <img
                className='w-[70px] h-[60px] object-fill bg-white p-1 rounded-md'
                src='/Images/logoT.png'
                alt="Logo"
              />
              <div className="logo-text">
                <h1 className="logo-title whitespace-nowrap">SSGMSSS TRUST</h1>
                <p className="logo-subtitle">{roleLabel}</p>
              </div>
            </div>
          ) : (
            <Tooltip title={`SSGMSSS TRUST — ${roleLabel}`} placement="right">
              <div className="logo-icon collapsed"><HeartOutlined /></div>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Menu */}
      <div className="menu-container">
        {menuItems.length === 0 ? (
          <div className="no-access-message">
            <LockOutlined className="no-access-icon" />
            <p>No menu access</p>
            <small>Contact administrator</small>
          </div>
        ) : (
          <Menu
            mode="inline"
            selectedKeys={[pathname || '/']}
            openKeys={openKeys}
            onOpenChange={setOpenKeys}
            onClick={handleMenuClick}
            items={menuItems}
            className="custom-menu"
            inlineIndent={20}
          />
        )}
      </div>

      <style jsx global>{sideBarStyle}</style>
    </Sider>
  );
};

export default SideBar;