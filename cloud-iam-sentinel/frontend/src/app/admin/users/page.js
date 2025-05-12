'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import AdminProtectRoute from '@/components/AdminProtectRoute';
import { api } from '@/utils/api';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    organization: '',
    role: 'user',
  });
  
  // Status messages
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const response = await api.get('/users');
        
        if (response.success) {
          setUsers(response.data.users);
        }
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchUsers();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      organization: '',
      role: 'user',
    });
    setEditingUserId(null);
    setShowAddUserForm(false);
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    
    if (formData.password !== formData.confirmPassword) {
      setFormError("Passwords don't match");
      setSubmitting(false);
      return;
    }
    
    try {
      const response = await api.post('/auth/users', {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        organization: formData.organization,
        role: formData.role
      });
      
      if (response.success) {
        const newUser = response.data;
        setUsers(prev => [...prev, newUser]);
        setFormSuccess('User created successfully');
        resetForm();
      }
    } catch (error) {
      setFormError(error.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditUser = (userId) => {
    const userToEdit = users.find(user => user.id === userId);
    if (userToEdit) {
      setFormData({
        name: userToEdit.name,
        email: userToEdit.email,
        organization: userToEdit.organization || '',
        role: userToEdit.role,
        password: '',
        confirmPassword: ''
      });
      setEditingUserId(userId);
      setShowAddUserForm(true);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    
    if (formData.password && formData.password !== formData.confirmPassword) {
      setFormError("Passwords don't match");
      setSubmitting(false);
      return;
    }
    
    try {
      const response = await api.put(`/auth/users/${editingUserId}`, {
        name: formData.name,
        email: formData.email,
        organization: formData.organization,
        role: formData.role,
        ...(formData.password ? { password: formData.password } : {})
      });
      
      if (response.success) {
        setUsers(prev => prev.map(user => 
          user.id === editingUserId 
            ? { 
                ...user, 
                name: formData.name,
                email: formData.email,
                organization: formData.organization,
                role: formData.role 
              } 
            : user
        ));
        
        setFormSuccess('User updated successfully');
        resetForm();
      }
    } catch (error) {
      setFormError(error.message || 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleUserStatus = async (userId) => {
    try {
      const response = await api.put(`/auth/users/${userId}/toggle-status`);
      
      if (response.success) {
        setUsers(prev => prev.map(user => 
          user.id === userId ? { ...user, active: !user.active } : user
        ));
      }
    } catch (error) {
      console.error('Failed to toggle user status:', error);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) {
      return;
    }
    
    try {
      const response = await api.delete(`/auth/users/${userId}`);
      
      if (response.success) {
        setUsers(prev => prev.filter(user => user.id !== userId));
      }
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(new Date(dateString));
  };

  if (loading) {
    return (
      <AdminProtectRoute>
        <DashboardLayout>
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        </DashboardLayout>
      </AdminProtectRoute>
    );
  }

  return (
    <AdminProtectRoute>
      <DashboardLayout>
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-semibold text-gray-800">User Management</h1>
              <p className="text-gray-600 mt-1">Manage your organization's users</p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowAddUserForm(!showAddUserForm);
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              {showAddUserForm ? 'Cancel' : 'Add New User'}
            </button>
          </div>
        </div>

        {/* User Form */}
        {showAddUserForm && (
          <div className="bg-white p-6 rounded-lg shadow mb-8">
            <h2 className="text-xl font-semibold mb-4">
              {editingUserId ? 'Edit User' : 'Add New User'}
            </h2>
            
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {formError}
              </div>
            )}
            
            <form onSubmit={editingUserId ? handleUpdateUser : handleAddUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="input-field"
                    placeholder="John Doe"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="input-field"
                    placeholder="user@example.com"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    id="role"
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                    className="input-field"
                    required
                  >
                    <option value="user">User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                
                <div>
                  <label htmlFor="organization" className="block text-sm font-medium text-gray-700 mb-1">
                    Organization
                  </label>
                  <input
                    id="organization"
                    name="organization"
                    type="text"
                    value={formData.organization}
                    onChange={handleInputChange}
                    className="input-field"
                    placeholder="Company Name"
                  />
                </div>
                
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    {editingUserId ? 'New Password (leave empty to keep current)' : 'Password'}
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="input-field"
                    placeholder="••••••••"
                    minLength="8"
                    required={!editingUserId}
                  />
                </div>
                
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="input-field"
                    placeholder="••••••••"
                    minLength="8"
                    required={!editingUserId || formData.password.length > 0}
                  />
                </div>
              </div>
              
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {submitting ? (
                    'Processing...'
                  ) : editingUserId ? (
                    'Update User'
                  ) : (
                    'Create User'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {formSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-6">
            {formSuccess}
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white shadow overflow-hidden rounded-lg">
          <div className="px-6 py-5 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-800">All Users</h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name / Email
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organization
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Login
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {user.organization || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'admin' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {user.role === 'admin' ? 'Administrator' : 'User'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.lastLogin)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex space-x-3 justify-end">
                        <button
                          onClick={() => handleEditUser(user.id)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleUserStatus(user.id)}
                          className={user.active ? "text-orange-600 hover:text-orange-900" : "text-green-600 hover:text-green-900"}
                        >
                          {user.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {users.length === 0 && (
            <div className="px-6 py-4 text-center text-gray-500">
              No users found.
            </div>
          )}
        </div>
      </DashboardLayout>
    </AdminProtectRoute>
  );
}