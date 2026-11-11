'use client';

import { useState } from 'react';
import { useCart } from '@/context/CartContext';

export function CartSummary() {
  const { items, total, itemCount, updateQuantity, removeItem, clearCart } = useCart();
  const [receiptOpen, setReceiptOpen] = useState(false);
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
    setReceiptOpen(true);
    clearCart();
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h3 className="text-xl font-bold text-gray-900">🛒 POS Register</h3>
          <p className="text-xs text-gray-500">Auto-adds on scan • Market Square Flow</p>
        </div>
        {items.length > 0 && (
          <button
            onClick={clearCart}
            className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 rounded hover:bg-rose-50"
          >
            Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">🛒</div>
          <p className="font-medium text-gray-700">Register Ready for Next Customer</p>
          <p className="text-xs text-gray-500 mt-1">
            Show any product in front of the camera — it beeps and adds here automatically!
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200"
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <span className="text-2xl shrink-0">{item.image}</span>
                  <div className="truncate">
                    <p className="font-bold text-gray-900 text-sm truncate">{item.name}</p>
                    <p className="text-xs text-emerald-700 font-semibold">
                      ${item.price.toFixed(2)} each
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="px-2 py-0.5 text-slate-700 hover:bg-slate-100 font-bold text-sm"
                    >
                      -
                    </button>
                    <span className="px-2 py-0.5 text-xs font-bold text-slate-900">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="px-2 py-0.5 text-slate-700 hover:bg-slate-100 font-bold text-sm"
                    >
                      +
                    </button>
                  </div>

                  <div className="text-right w-14">
                    <p className="text-sm font-extrabold text-gray-900">
                      ${(item.price * item.quantity).toFixed(2)}
                    </p>
                  </div>

                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-slate-400 hover:text-rose-600 text-xs font-bold"
                    title="Remove item"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Total Items:</span>
              <span className="font-bold text-gray-900">{itemCount} pcs</span>
            </div>
            <div className="flex justify-between text-2xl font-extrabold text-gray-900 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
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
                className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  paymentMethod === method
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {method === 'POS Card' ? '💳 Card' : method === 'Cash' ? '💵 Cash' : '🏦 Transfer'}
              </button>
            ))}
          </div>

          <button
            onClick={handleCheckout}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-lg transition-all text-base"
          >
            ✅ Complete Payment (${total.toFixed(2)})
          </button>
        </>
      )}

      {/* Instant Receipt Modal */}
      {receiptOpen && lastReceipt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="text-center border-b border-dashed pb-3">
              <div className="text-3xl mb-1">🧾</div>
              <h4 className="font-extrabold text-lg text-slate-900">PROSCAN SUPERMARKET POS</h4>
              <p className="text-xs text-slate-500">
                Receipt #{lastReceipt.id} • {lastReceipt.time}
              </p>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto text-sm">
              {lastReceipt.items.map((it) => (
                <div key={it.id} className="flex justify-between text-slate-800">
                  <span>
                    {it.quantity}x {it.name}
                  </span>
                  <span className="font-bold">${(it.price * it.quantity).toFixed(2)}</span>
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
              onClick={() => setReceiptOpen(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm"
            >
              Next Customer →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
