import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Tag, X, Check } from 'lucide-react';

export interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string;
  isDefault: boolean;
}

interface CategoryManagerProps {
  categories: Category[];
  onCreateCategory: (category: { name: string; color: string; icon?: string }) => Promise<void>;
  onUpdateCategory: (id: string, updates: { name?: string; color?: string; icon?: string }) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  isLoading?: boolean;
}

const DEFAULT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
];

const DEFAULT_ICONS = ['🏷️', '🍔', '🚗', '💡', '🏠', '💰', '🎯', '📱', '⛽', '🛒', '🎬', '💊', '✈️', '🎓', '👕'];

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  categories,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  isLoading = false,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState({
    name: '',
    color: DEFAULT_COLORS[0],
    icon: DEFAULT_ICONS[0],
  });
  const [editCategory, setEditCategory] = useState({
    name: '',
    color: '',
    icon: '',
  });

  // Handle create category
  const handleCreate = async () => {
    if (!newCategory.name.trim()) return;

    try {
      await onCreateCategory({
        name: newCategory.name.trim(),
        color: newCategory.color,
        icon: newCategory.icon,
      });
      
      setNewCategory({
        name: '',
        color: DEFAULT_COLORS[0],
        icon: DEFAULT_ICONS[0],
      });
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create category:', error);
    }
  };

  // Handle edit category
  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setEditCategory({
      name: category.name,
      color: category.color,
      icon: category.icon || '',
    });
  };

  // Handle update category
  const handleUpdate = async () => {
    if (!editingId || !editCategory.name.trim()) return;

    try {
      await onUpdateCategory(editingId, {
        name: editCategory.name.trim(),
        color: editCategory.color,
        icon: editCategory.icon,
      });
      
      setEditingId(null);
      setEditCategory({ name: '', color: '', icon: '' });
    } catch (error) {
      console.error('Failed to update category:', error);
    }
  };

  // Handle delete category
  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this category? This action cannot be undone.')) {
      try {
        await onDeleteCategory(id);
      } catch (error) {
        console.error('Failed to delete category:', error);
      }
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditCategory({ name: '', color: '', icon: '' });
  };

  // Cancel creating
  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewCategory({
      name: '',
      color: DEFAULT_COLORS[0],
      icon: DEFAULT_ICONS[0],
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Categories</h3>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          disabled={isLoading || isCreating}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-white rounded-button hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={16} />
          Add Category
        </button>
      </div>

      {/* Create Category Form */}
      {isCreating && (
        <div className="bg-gray-50 rounded-card p-4 border border-gray-200">
          <h4 className="font-medium text-gray-900 mb-3">Create New Category</h4>
          
          <div className="space-y-3">
            {/* Category Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category Name
              </label>
              <input
                type="text"
                value={newCategory.name}
                onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter category name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-button focus:ring-2 focus:ring-primary focus:border-transparent"
                maxLength={50}
              />
            </div>

            {/* Color Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Color
              </label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewCategory(prev => ({ ...prev, color }))}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      newCategory.color === color
                        ? 'border-gray-900 scale-110'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Icon Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Icon
              </label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setNewCategory(prev => ({ ...prev, icon }))}
                    className={`w-10 h-10 rounded-button border-2 flex items-center justify-center text-lg transition-all ${
                      newCategory.icon === icon
                        ? 'border-primary bg-primary-light'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newCategory.name.trim() || isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-button hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={16} />
                Create
              </button>
              <button
                type="button"
                onClick={handleCancelCreate}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-button hover:bg-gray-50"
              >
                <X size={16} />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Categories List */}
      <div className="space-y-2">
        {categories.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Tag size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No categories yet</p>
            <p className="text-sm">Create your first category to organize transactions</p>
          </div>
        ) : (
          categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-button hover:shadow-sm transition-shadow"
            >
              {editingId === category.id ? (
                // Edit Mode
                <div className="flex-1 flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                    style={{ backgroundColor: editCategory.color }}
                  >
                    {editCategory.icon}
                  </div>
                  
                  <input
                    type="text"
                    value={editCategory.name}
                    onChange={(e) => setEditCategory(prev => ({ ...prev, name: e.target.value }))}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                    maxLength={50}
                  />
                  
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={handleUpdate}
                      disabled={!editCategory.name.trim() || isLoading}
                      className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="p-1 text-gray-500 hover:text-gray-700"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                      style={{ backgroundColor: category.color }}
                    >
                      {category.icon}
                    </div>
                    
                    <div>
                      <div className="font-medium text-gray-900">{category.name}</div>
                      {category.isDefault && (
                        <div className="text-xs text-gray-500">Default category</div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(category)}
                      disabled={isLoading}
                      className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      <Edit2 size={16} />
                    </button>
                    
                    {!category.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleDelete(category.id)}
                        disabled={isLoading}
                        className="p-2 text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};