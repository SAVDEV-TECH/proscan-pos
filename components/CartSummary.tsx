'use client';

import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import { isRealImage } from '@/lib/products';

export function CartSummary() {
  const { items, total, itemCount, updateQuantity, removeItem, clearCart } = useCart();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'POS Card' | 'Cash' | 'Transfer'>('POS Card');
  const [lastReceipt, setLastReceipt] = useState<{
    id: string;
    time: string;
    method: string;
    items: typeof items;
    total: number;
  } | null>(null);

  const handleCheckout = () => {
    if (items.length === 0) return;
    setLastReceipt({
      id: `POS-${Math.floor(100000 + Math.random() * 900000)}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      method: paymentMethod,
      items: [...items],
      total,
    });
    setMobileDrawerOpen(false);
    setReceiptOpen(true);
    clearCart();
  };

  const renderCartItemsAndControls = () => (
    <>
      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-200"
          >
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              {isRealImage(item.image) ? (
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-11 h-11 rounded-lg object-cover border border-slate-300 shadow-sm shrink-0"
                />
              ) : (
                <span className="text-2xl shrink-0">{item.image}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 text-sm truncate">{item.name}</p>
                <p className="text-xs text-emerald-700 font-semibold">
                  ${item.price.toFixed(2)} each
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between xs:justify-end space-x-2 shrink-0 pt-1 xs:pt-0 border-t xs:border-t-0 border-slate-200/70">
              <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 font-bold text-base"
                  aria-label={`Decrease quantity of ${item.name}`}
                >
                  −
                </button>
                <span className="px-2.5 py-0.5 text-xs font-bold text-slate-900 min-w-[1.75rem] text-center">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 font-bold text-base"
                  aria-label={`Increase quantity of ${item.name}`}
                >
                  +
                </button>
              </div>

              <div className="text-right min-w-[3.5rem]">
                <p className="text-sm font-extrabold text-gray-900">
                  ${(item.price * item.quantity).toFixed(2)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-xs font-bold"
                title="Remove item"
                aria-label={`Remove ${item.name}`}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t pt-3.5 space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Total Items:</span>
          <span className="font-bold text-gray-900">{itemCount} pcs</span>
        </div>
        <div className="flex justify-between items-center text-xl sm:text-2xl font-extrabold text-gray-900 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
          <span>TOTAL:</span>
          <span className="text-emerald-700">${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Payment Method Selector */}
      <div className="grid grid-cols-3 gap-1.5 pt-1">
        {(['POS Card', 'Cash', 'Transfer'] as const).map((method) => (
          <button
            key={method}
            type="button"
            onClick={() => setPaymentMethod(method)}
            className={`min-h-[40px] py-2 px-2 rounded-lg text-xs font-bold border transition-all active:scale-[0.98] ${
              paymentMethod === method
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {method === 'POS Card' ? '💳 Card' : method === 'Cash' ? '💵 Cash' : '🏦 Transfer'}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleCheckout}
        className="w-full min-h-[48px] py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-extrabold rounded-xl shadow-lg transition-all text-sm sm:text-base"
      >
        ✅ Complete Payment (${total.toFixed(2)})
      </button>
    </>
  );

  return (
    <>
      <div id="pos-register-card" className="card space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">🛒 POS Register</h3>
            <p className="text-xs text-gray-500">Auto-adds on scan • Market Square Flow</p>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50"
            >
              Clear
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-gray-500">
            <div className="text-3xl sm:text-4xl mb-2">🛒</div>
            <p className="font-medium text-gray-700 text-sm sm:text-base">Register Ready for Next Customer</p>
            <p className="text-xs text-gray-500 mt-1">
              Show any product in front of the camera — it beeps and adds here automatically!
            </p>
          </div>
        ) : (
          renderCartItemsAndControls()
        )}
      </div>

      {/* Mobile Sticky Bottom Checkout Bar (visible on mobile/tablet when cart has items) */}
      {items.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2.5 shadow-[0_-8px_25px_rgba(0,0,0,0.1)]">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="flex items-center space-x-2.5 text-left min-w-0 flex-1 py-1"
            >
              <div className="relative bg-indigo-600 text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0">
                <span className="text-lg">🛒</span>
                <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[11px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                  {itemCount}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-indigo-600 flex items-center gap-1">
                  <span>Tap to view cart</span>
                  <span>▲</span>
                </p>
                <p className="text-base font-extrabold text-slate-900 truncate">
                  ${total.toFixed(2)}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={handleCheckout}
              className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold px-4 py-2.5 rounded-xl shadow-md text-xs sm:text-sm shrink-0"
            >
              ✅ Pay ${total.toFixed(2)}
            </button>
          </div>
        </div>
      )}

      {/* Mobile Slide-Up Cart Drawer */}
      {mobileDrawerOpen && items.length > 0 && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-white w-full max-h-[85vh] rounded-t-3xl p-4 sm:p-6 shadow-2xl border-t border-slate-200 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">🛒 POS Register ({itemCount})</h3>
                <p className="text-xs text-slate-500">Review items or complete checkout</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    clearCart();
                    setMobileDrawerOpen(false);
                  }}
                  className="text-xs text-rose-600 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center"
                  aria-label="Close cart drawer"
                >
                  ✕
                </button>
              </div>
            </div>

            {renderCartItemsAndControls()}
          </div>
        </div>
      )}

      {/* Instant Receipt Modal */}
      {receiptOpen && lastReceipt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="text-center border-b border-dashed pb-3">
              <div className="text-3xl mb-1">🧾</div>
              <h4 className="font-extrabold text-base sm:text-lg text-slate-900">PROSCAN SUPERMARKET POS</h4>
              <p className="text-xs text-slate-500">
                Receipt #{lastReceipt.id} • {lastReceipt.time}
              </p>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto text-sm">
              {lastReceipt.items.map((it) => (
                <div key={it.id} className="flex justify-between gap-2 text-slate-800">
                  <span className="truncate">
                    {it.quantity}x {it.name}
                  </span>
                  <span className="font-bold shrink-0">${(it.price * it.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed pt-3 space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Payment Method</span>
                <span className="font-semibold text-slate-800">{lastReceipt.method}</span>
              </div>
              <div className="flex justify-between text-lg font-extrabold text-emerald-700">
                <span>PAID TOTAL</span>
                <span>${lastReceipt.total.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setReceiptOpen(false)}
              className="w-full min-h-[44px] py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm"
            >
              Next Customer →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
