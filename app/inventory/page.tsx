'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Product, getProductPhoto } from '@/lib/products';
import { fetchProducts, createProduct, updateProduct, deleteProduct, fetchDetectionClasses } from '@/lib/api';
import {
  CartIcon,
  CameraIcon,
  PlusIcon,
  SearchIcon,
  RefreshIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  CpuIcon,
  ProductThumbnail,
} from '@/components/Icons';

export default function InventoryDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    category: 'Produce',
    image: '',
    barcode: '',
    yolo_classes: 'bottle',
    description: '',
  });

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [items, classes] = await Promise.all([
        fetchProducts(),
        fetchDetectionClasses(),
      ]);
      setProducts(items);
      setAvailableClasses(classes);
    } catch {
      showNotification('Failed to load inventory from server', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived metrics
  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ['All', ...Array.from(set)];
  }, [products]);

  const stats = useMemo(() => {
    const total = products.length;
    const avgPrice = total > 0 ? (products.reduce((acc, p) => acc + p.price, 0) / total).toFixed(2) : '0.00';
    const mapped = products.filter(
      (p) => (p.yolo_classes && p.yolo_classes.trim() !== '') || p.has_visual_fingerprint
    ).length;
    return { total, avgPrice, mapped, categoriesCount: categories.length - 1 };
  }, [products, categories]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.barcode.includes(searchTerm) ||
        (p.yolo_classes && p.yolo_classes.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  // Add Product Handler
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.price) {
      showNotification('Please fill in required fields', 'error');
      return;
    }

    try {
      const newProduct = await createProduct({
        name: formData.name,
        price: parseFloat(formData.price),
        category: formData.category,
        image: formData.image,
        barcode: formData.barcode.trim() || String(Math.floor(100000000000 + Math.random() * 900000000000)),
        yolo_classes: formData.yolo_classes,
        description: formData.description,
      });

      setProducts((prev) => [newProduct, ...prev]);
      setIsAddModalOpen(false);
      setFormData({
        name: '',
        price: '',
        category: 'Produce',
        image: '',
        barcode: '',
        yolo_classes: 'bottle',
        description: '',
      });
      showNotification(`Created "${newProduct.name}"`);
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Error creating product', 'error');
    }
  };

  // Update Product Handler
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    try {
      const updated = await updateProduct(editingProduct.id, {
        name: editingProduct.name,
        price: editingProduct.price,
        category: editingProduct.category,
        image: editingProduct.image,
        barcode: editingProduct.barcode,
        yolo_classes: editingProduct.yolo_classes,
        description: editingProduct.description,
      });

      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditingProduct(null);
      showNotification(`Updated "${updated.name}" ($${updated.price.toFixed(2)})`);
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Error updating product', 'error');
    }
  };

  // Delete Product Handler
  const handleDelete = async (product: Product) => {
    if (!confirm(`Are you sure you want to delete "${product.name}"?`)) return;

    try {
      await deleteProduct(product.id);
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      showNotification(`Deleted "${product.name}"`);
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Error deleting product', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            <Link
              href="/"
              className="font-bold text-base sm:text-lg text-indigo-600 hover:text-indigo-700 flex items-center space-x-2 shrink-0"
            >
              <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                <CartIcon className="w-4 h-4" />
              </span>
              <span>Proscan POS</span>
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-800 text-xs sm:text-sm truncate">
              Inventory
            </span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <Link
              href="/"
              className="text-xs sm:text-sm font-semibold text-slate-700 hover:text-indigo-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors flex items-center space-x-1.5"
            >
              <CameraIcon className="w-4 h-4" />
              <span>Scanner</span>
            </Link>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg shadow-sm transition-all flex items-center space-x-1"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        {/* Toast Notification */}
        {notification && (
          <div
            className={`fixed inset-x-4 bottom-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 px-4 py-2.5 rounded-xl shadow-2xl font-semibold text-xs sm:text-sm transition-all flex items-center justify-between space-x-2 ${
              notification.type === 'success'
                ? 'bg-emerald-600 text-white border border-emerald-400'
                : 'bg-rose-600 text-white border border-rose-400'
            }`}
          >
            <span className="break-words">{notification.message}</span>
          </div>
        )}

        {/* Dashboard Analytics Bar */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 sm:mb-6">
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">SKUs</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">{stats.total}</p>
          </div>

          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Avg Price</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600 mt-1">${stats.avgPrice}</p>
          </div>

          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">AI Mapped</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-indigo-600 mt-1">{stats.mapped}</p>
          </div>

          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Categories</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-amber-600 mt-1">{stats.categoriesCount}</p>
          </div>
        </section>

        {/* Toolbar: Search, Filter, Refresh */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-sm mb-5 sm:mb-6 flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-center justify-between">
          <div className="w-full sm:w-80 relative">
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 sm:py-2 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="absolute left-3 top-3 sm:top-2.5 text-slate-400">
              <SearchIcon className="w-4 h-4" />
            </span>
          </div>

          <div className="w-full sm:w-auto flex items-center space-x-2.5">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2.5 sm:py-2 border border-slate-300 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'All' ? 'All Categories' : c}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={loadData}
              className="min-h-[42px] min-w-[42px] flex items-center justify-center p-2 border border-slate-300 rounded-xl hover:bg-slate-50 active:scale-95 text-slate-600 transition-all shrink-0"
              title="Refresh Catalog"
              aria-label="Refresh Catalog"
            >
              <RefreshIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Product Cards (visible on mobile < md) */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 animate-pulse text-sm">
              Loading inventory...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
              No products found.
            </div>
          ) : (
            filteredProducts.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <ProductThumbnail
                      src={getProductPhoto(p)}
                      name={p.name}
                      category={p.category}
                      className="w-12 h-12 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 text-sm sm:text-base truncate">{p.name}</p>
                      <p className="text-xs text-slate-500 line-clamp-1">
                        {p.description || 'No description'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold text-emerald-600 text-lg">${p.price.toFixed(2)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="px-2.5 py-1 rounded-md font-semibold bg-slate-100 text-slate-700">
                    {p.category}
                  </span>
                  <span className="px-2.5 py-1 rounded-md font-mono text-slate-600 bg-slate-50 border border-slate-200">
                    #{p.barcode}
                  </span>
                  {p.has_visual_fingerprint && (
                    <span className="px-2.5 py-1 rounded-md font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center space-x-1">
                      <CameraIcon className="w-3 h-3" />
                      <span>Trained</span>
                    </span>
                  )}
                  {p.yolo_classes && (
                    <span className="px-2.5 py-1 rounded-md font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center space-x-1">
                      <CpuIcon className="w-3 h-3" />
                      <span>{p.yolo_classes}</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingProduct({ ...p })}
                    className="min-h-[40px] py-2 px-3 text-xs font-bold text-indigo-600 bg-indigo-50/70 hover:bg-indigo-100 rounded-xl transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <EditIcon className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    className="min-h-[40px] py-2 px-3 text-xs font-bold text-rose-600 bg-rose-50/70 hover:bg-rose-100 rounded-xl transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Product Table (visible on md and up) */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs tracking-wider">
                <tr>
                  <th className="px-6 py-4">Item</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Price</th>
                  <th className="px-6 py-4">Barcode</th>
                  <th className="px-6 py-4">AI Label</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400 animate-pulse">
                      Loading inventory...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      No products found.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 flex items-center space-x-3">
                        <ProductThumbnail
                          src={getProductPhoto(p)}
                          name={p.name}
                          category={p.category}
                          className="w-11 h-11 rounded-xl"
                        />
                        <div>
                          <p className="font-bold text-slate-900">{p.name}</p>
                          <p className="text-xs text-slate-500 line-clamp-1">{p.description || 'No description'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">
                          {p.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-emerald-600 text-base">
                        ${p.price.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-600">
                        {p.barcode}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {p.has_visual_fingerprint && (
                            <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center space-x-1">
                              <CameraIcon className="w-3 h-3" />
                              <span>Trained</span>
                            </span>
                          )}
                          {p.yolo_classes ? (
                            <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center space-x-1">
                              <CpuIcon className="w-3 h-3" />
                              <span>{p.yolo_classes}</span>
                            </span>
                          ) : (
                            !p.has_visual_fingerprint && (
                              <span className="text-xs text-slate-400 italic">None</span>
                            )
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => setEditingProduct({ ...p })}
                          className="px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors inline-flex items-center space-x-1"
                        >
                          <EditIcon className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors inline-flex items-center space-x-1"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal: Create Product */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center space-x-2">
                <PlusIcon className="w-4 h-4 text-indigo-600" />
                <span>Add Product</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-700 font-bold flex items-center justify-center"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Sparkling Water"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 sm:py-2 border border-slate-300 rounded-xl text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="1.99"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-3.5 py-2.5 sm:py-2 border border-slate-300 rounded-xl text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category</label>
                  <input
                    type="text"
                    placeholder="Beverages"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 sm:py-2 border border-slate-300 rounded-xl text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">AI Label</label>
                <select
                  value={formData.yolo_classes}
                  onChange={(e) => setFormData({ ...formData, yolo_classes: e.target.value })}
                  className="w-full px-3.5 py-2.5 sm:py-2 border border-slate-300 rounded-xl text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                >
                  {availableClasses.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Barcode (Optional)</label>
                <input
                  type="text"
                  placeholder="Auto-generated if blank"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  className="w-full px-3.5 py-2.5 sm:py-2 border border-slate-300 rounded-xl text-base sm:text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief product notes..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="min-h-[44px] px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Product */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center space-x-2 min-w-0">
                <EditIcon className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="truncate">Edit &quot;{editingProduct.name}&quot;</span>
              </h2>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-700 font-bold flex items-center justify-center shrink-0"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-3.5 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 sm:py-2 border border-slate-300 rounded-xl text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editingProduct.price}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2.5 sm:py-2 border border-slate-300 rounded-xl text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold text-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category</label>
                  <input
                    type="text"
                    value={editingProduct.category}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 sm:py-2 border border-slate-300 rounded-xl text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">AI Label</label>
                <select
                  value={editingProduct.yolo_classes || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, yolo_classes: e.target.value })}
                  className="w-full px-3.5 py-2.5 sm:py-2 border border-slate-300 rounded-xl text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                >
                  {availableClasses.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Barcode</label>
                <input
                  type="text"
                  value={editingProduct.barcode}
                  onChange={(e) => setEditingProduct({ ...editingProduct, barcode: e.target.value })}
                  className="w-full px-3.5 py-2.5 sm:py-2 border border-slate-300 rounded-xl text-base sm:text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editingProduct.description || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="min-h-[44px] px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md"
                >
                  Update Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
