"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Menu, Badge, Tooltip, Tag, Modal } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  TeamOutlined,
  HeartOutlined,
  SettingOutlined,
  FileTextOutlined,
  MessageOutlined,
  StarOutlined,
  GiftOutlined,
  CalendarOutlined,
  BellOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  FileProtectOutlined,
  DatabaseOutlined,
  CreditCardOutlined,
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
import { onSnapshot, collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../../../lib/firbase-client';

const { Sider } = Layout;

const SideBar = ({ collapsed, setCollapsed }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [openKeys, setOpenKeys] = useState([]);
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  // Helper function to check if user has access to a page
  const hasAccess = (pageKey) => {
    if (!user) return false;
    
    // Super admin has access to everything
    if (user.role === 'superadmin') return true;
    
    // Check permissions object
    const permissions = user.permissions || {};
    
    // Check if page is in allowed pages
    if (permissions.pages?.includes(pageKey)) {
      return true;
    }
    
    // Check if any parent path grants access
    const pathSegments = pageKey.split('/').filter(Boolean);
    let currentPath = '';
    
    for (const segment of pathSegments) {
      currentPath += `/${segment}`;
      if (permissions.pages?.includes(currentPath)) {
        return true;
      }
    }
    
    return false;
  };

  // Helper function to check if user has module access
  const hasModuleAccess = (moduleKey) => {
    if (!user) return false;
    
    // Super admin has access to everything
    if (user.role === 'superadmin') return true;
    
    // Check module access
    const moduleAccess = user.permissions?.moduleAccess || {};
    return moduleAccess[moduleKey] === true;
  };

  // Recursive function to check if user has access to any child in nested structure
  const hasAnyChildAccessRecursive = (childItem) => {
    if (!childItem) return false;
    
    // If this item has its own key, check direct access
    if (childItem.key && hasAccess(childItem.key)) {
      return true;
    }
    
    // If this item has children, check them recursively
    if (childItem.children && Array.isArray(childItem.children)) {
      return childItem.children.some(grandChild => 
        hasAnyChildAccessRecursive(grandChild)
      );
    }
    
    return false;
  };

  // Check if parent should be shown based on children access
  const shouldShowParent = (item) => {
    // Super admin sees everything
    if (user?.role === 'superadmin') return true;
    
    if (!item.children || !Array.isArray(item.children)) {
      // If no children, check direct access
      return hasAccess(item.key) || hasModuleAccess(item.module);
    }
    
    // Check if any child is accessible
    const hasAccessibleChild = item.children.some(child => {
      if (child.children) {
        // For nested children, check recursively
        return hasAnyChildAccessRecursive(child);
      }
      return hasAccess(child.key);
    });
    
    // Also check if parent itself is directly accessible
    const hasDirectParentAccess = hasAccess(item.key);
    
    return hasAccessibleChild || hasDirectParentAccess;
  };

  // Filter menu items based on permissions
  const getFilteredMenuItems = () => {
    const allMenuItems = [
      {
        key: '/',
        icon: <DashboardOutlined />,
        label: collapsed ? null : 'Dashboard',
        module: 'dashboard'
      },
      {
        key: '/programs',
        icon: <AppstoreOutlined />,
        label: collapsed ? null : 'Programs',
        module: 'programs',
        children: [
          {
            key: '/programs/members',
            label: 'Members',
            module: 'programs'
          },
          {
            key: '/programs/closing-forms',
            label: 'Closing Forms',
            module: 'programs'
          },
          {
            key: '/programs/yojnas',
            label: 'Yojnas',
            module: 'programs'
          },
        ],
      },
      {
        key: '/agents',
        icon: <UserSwitchOutlined />,
        label: collapsed ? null : 'Agents',
        module: 'agents'
      },
      {
        key: '/members',
        icon: <TeamOutlined />,
        label: collapsed ? null : 'Members',
        module: 'members'
      },
      {
        key: '/requests',
        icon: <InboxOutlined />,
        label: collapsed ? null : (
          <div className='flex items-center gap-2'>
            Requests {pendingCount > 0 && (
              <span className='bg-pink-600 font-bold text-[14px] !text-white flex items-center justify-center rounded-full h-[24px] min-h-[24px] min-w-[24px] text-center'>
                {pendingCount}
              </span>
            )}
          </div> 
        ),
        module: 'requests'
      },
      {
        key: '/payments',
        icon: <CreditCardOutlined />,
        label: collapsed ? null : 'Payments',
        module: 'payments',
        children: [
          {
            key: '/payments/join-fees',
            label: 'Join Fees',
            module: 'payments'
          },
          {
            key: '/payments/closing-payment',
            label: 'Closing Payment',
            module: 'payments'
          },
        ],
      },
      {
        key: '/master',
        icon: <DatabaseOutlined />,
        label: collapsed ? null : 'Master',
        module: 'master',
        children: [
          {
            key: '/master/users',
            label: 'Users',
            module: 'master',
            requiredPermission: 'manage_users'
          },
          {
            key: '/master/state',
            label: 'State',
            module: 'master'
          },
          {
            key: '/master/district',
            label: 'District',
            module: 'master'
          },
          {
            key: '/master/city',
            label: 'City',
            module: 'master'
          },    
          {
            key: '/master/cast',
            label: 'Cast',
            module: 'master'
          },
          {
            key: '/master/relations',
            label: 'Relations',
            module: 'master'
          },
        ],
      },
      {
        key: '/rule-policy',
        icon: <FileProtectOutlined />,
        label: collapsed ? null : 'Rule & Policy',
        module: 'rulePolicy'
      },
      {
        key: '/expenses',
        icon: <TagOutlined />,
        label: collapsed ? null : 'Expenses',
        module: 'expenses'
      },
      {
        key: '/settings',
        icon: <SettingOutlined />,
        label: collapsed ? null : 'Settings',
        module: 'settings',
        children: [
          {
            key: '/settings/about',
            label: 'About',
            module: 'settings'
          },
          {
            key: '/settings/contact',
            label: 'Contact',
            module: 'settings'
          },
          {
            key: '/settings/security',
            label: 'Security',
            module: 'settings',
            children: [
              {
                key: '/settings/security/change-password',
                label: 'Password Change',
                module: 'settings'
              },
              {
                key: '/settings/security/sessions',
                label: 'Sessions',
                module: 'settings'
              },
            ],
          },
        ],
      },
      {
        key: '/trash',
        icon: <DeleteOutlined />,
        label: collapsed ? null : 'Trash',
        module: 'trash'
      },
    ];

    // If user is superadmin, return all menu items without filtering
    if (user?.role === 'superadmin') {
      return allMenuItems;
    }

    // Filter the menu items for non-superadmin users
    return allMenuItems.filter(item => {
      // First check if we should show this parent item
      if (!shouldShowParent(item)) {
        return false;
      }

      // If item has children, filter them
      if (item.children) {
        const filteredChildren = filterChildren(item.children);
        // Only show item if it has accessible children or direct access
        if (filteredChildren.length > 0 || hasAccess(item.key)) {
          return {
            ...item,
            children: filteredChildren
          };
        }
        return false;
      }

      // For items without children, check direct access
      return hasAccess(item.key) || hasModuleAccess(item.module);
    }).map(item => {
      // Return filtered structure
      if (item.children) {
        return {
          ...item,
          children: filterChildren(item.children)
        };
      }
      return item;
    });
  };

  // Recursively filter children based on permissions
  const filterChildren = (children) => {
    // If user is superadmin, return all children without filtering
    if (user?.role === 'superadmin') {
      return children;
    }

    return children.filter(child => {
      // Check required permission if specified
      if (child.requiredPermission) {
        const hasRequiredPermission = user?.permissions?.actions?.[child.requiredPermission] === true;
        if (!hasRequiredPermission) {
          return false;
        }
      }

      // If child has its own children, filter them recursively
      if (child.children) {
        const filteredGrandChildren = filterChildren(child.children);
        // Show child only if it has any accessible grandchildren or direct access
        if (filteredGrandChildren.length > 0 || hasAccess(child.key)) {
          return {
            ...child,
            children: filteredGrandChildren
          };
        }
        return false;
      }

      // Check if user has access to this page
      return hasAccess(child.key);
    });
  };

  // Wrap menu items with tooltips when collapsed
  const getWrappedMenuItems = (items) => {
    if (!collapsed) return items;

    return items.map(item => ({
      ...item,
      label: (
        <Tooltip 
          title={item.label || getItemTitle(item.key)} 
          placement="right"
        >
          <span>{item.icon}</span>
        </Tooltip>
      ),
      icon: null,
      children: item.children ? getWrappedMenuItems(item.children) : undefined,
    }));
  };

  // Get item title from key
  const getItemTitle = (key) => {
    const titles = {
      '/': 'Dashboard',
      '/programs': 'Programs',
      '/agents': 'Agents',
      '/members': 'Members',
      '/payments': 'Payments',
      '/master': 'Master',
      '/trash': "Trash",
      '/requests': "Requests",
      '/rule-policy': 'Rule & Policy',
      '/settings': 'Settings',
      '/programs/members': 'Members',
      '/programs/closing-forms': 'Closing Forms',
      '/programs/yojnas': 'Yojnas',
      '/payments/join-fees': 'Join Fees',
      '/payments/closing-payment': 'Closing Payment',
      '/master/users': 'Users',
      '/master/state': 'State',
      '/master/district': 'District',
      '/master/relations': 'Relations',
      '/settings/about': 'About',
      '/settings/contact': 'Contact',
      '/settings/users': 'Users',
      '/settings/security': 'Security',
      '/settings/security/change-password': 'Password Change',
      '/settings/security/sessions': 'Sessions',
      '/settings/security/user-permissions': 'User Permissions',
    };
    return titles[key] || '';
  };

  // Handle menu click
  const handleMenuClick = ({ key }) => {
    // Check if user has access before navigating
    if (!hasAccess(key)) {
      // Show access denied message
      Modal.error({
        title: 'Access Denied',
        content: 'You do not have permission to access this page.',
        okText: 'OK'
      });
      return;
    }
    
    router.push(key);
  };

  // Get current selected key from pathname
  const getSelectedKey = () => {
    return pathname || '/dashboard';
  };

  // Get open keys based on pathname
  const getDefaultOpenKeys = () => {
    const keys = [];
    const menuItems = getFilteredMenuItems();
    
    menuItems.forEach((item) => {
      if (item.children) {
        const hasActiveChild = item.children.some((child) =>
          pathname.startsWith(child.key)
        );
        if (hasActiveChild) {
          keys.push(item.key);
        }
        
        // Check grandchildren
        item.children.forEach(child => {
          if (child.children) {
            const hasActiveGrandChild = child.children.some(grandChild =>
              pathname.startsWith(grandChild.key)
            );
            if (hasActiveGrandChild) {
              keys.push(item.key);
              keys.push(child.key);
            }
          }
        });
      }
    });
    return keys;
  };

  // Initialize open keys on mount
  useEffect(() => {
    if (!collapsed) {
      setOpenKeys(getDefaultOpenKeys());
    } else {
      setOpenKeys([]);
    }
  }, [pathname, collapsed, user]);



  // Setup real-time listener for pending count
  useEffect(() => {
    if (!user) return;

    let unsubscribe;

    const setupListener = async () => {
      const membersRef = collection(db, "members");
      let q;
      
      // Create query based on user role
      if (user.role === 'agent') {
        q = query(
          membersRef,
          where("status", "==", "pending_approval"),
          where("agentId", "==", user.uid),
          where("delete_flag", "!=", true)
        );
      } else {
        // For admin/superadmin, get all pending
        q = query(
          membersRef,
          where("status", "==", "pending_approval"),
          where("delete_flag", "!=", true)
        );
      }

      // Set up real-time listener
      unsubscribe = onSnapshot(q, (snapshot) => {
        setPendingCount(snapshot.size);
      }, (error) => {
        console.error("Error in pending count listener:", error);
      });
    };

    setupListener();

    // Cleanup listener on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user]); // Re-run when user changes

  // Get filtered and wrapped menu items
  const menuItems = useMemo(() => {
    const filteredItems = getFilteredMenuItems();
    return getWrappedMenuItems(filteredItems);
  }, [collapsed, user, pendingCount]); // Add pendingCount as dependency

  // Show loading state if user data is not available
  if (!user) {
    return (
      <Sider
        collapsed={collapsed}
        collapsedWidth={80}
        width={280}
        className="sidebar-custom"
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          background: '#ffffff',
          borderRight: '1px solid #fde2d8',
        }}
      >
        <div className="sidebar-header">
          <div className={`logo-container ${collapsed ? 'collapsed' : ''}`}>
            {!collapsed ? (
              <div className="logo-content">
                <div className="logo-icon">
                  <HeartOutlined />
                </div>
                <div className="logo-text">
                  <h1 className="logo-title">SSGMSSS TRUST</h1>
                  <p className="logo-subtitle">Loading...</p>
                </div>
              </div>
            ) : (
              <Tooltip title="MatrimonyHub Admin Portal" placement="right">
                <div className="logo-icon collapsed">
                  <HeartOutlined />
                </div>
              </Tooltip>
            )}
          </div>
        </div>
      </Sider>
    );
  }
 const handleOpenChange = (keys) => {
    setOpenKeys(keys);
  };
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
      style={{
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
      }}
    >
      {/* Logo Section */}
      <div className="sidebar-header">
        <div className={`logo-container ${collapsed ? 'collapsed' : ''}`}>
          {!collapsed ? (
            <div className="logo-content">
              <img className='w-[70px] h-[60px] object-fill bg-white p-1 rounded-md' src='/Images/logoT.png' alt="Logo"/>
              <div className="logo-text">
                <h1 className="logo-title whitespace-nowrap">SSGMSSS TRUST</h1>
                <p className="logo-subtitle">
                  {user.role === 'superadmin' ? 'Super Admin' : 
                   user.role === 'admin' ? 'Admin Portal' : 
                   user.role === 'agent' ? 'Agent Portal' : 'Member Portal'}
                </p>
              </div>
            </div>
          ) : (
            <Tooltip 
              title={`MatrimonyHub - ${user.role === 'superadmin' ? 'Super Admin' : user.role}`} 
              placement="right"
            >
              <div className="logo-icon collapsed">
                <HeartOutlined />
              </div>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Menu */}
      <div className="menu-container">
        {menuItems.length === 0 ? (
          <div className="no-access-message">
            <LockOutlined className="no-access-icon" />
            <p>No menu access granted</p>
            <small>Contact administrator for permissions</small>
          </div>
        ) : (
          <Menu
            mode="inline"
            selectedKeys={[getSelectedKey()]}
            openKeys={openKeys}
            onOpenChange={handleOpenChange}
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