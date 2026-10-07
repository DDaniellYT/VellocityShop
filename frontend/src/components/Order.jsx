

const Order = (order) =>{
    const trackingUrl = getTrackingUrl(order.carrier, order.awb_number);
        return (
        <div key={order.id} className="order-card">
            <div className="order-card-header">
            <span>Order #{order.order_number}</span>
            <span>{new Date(order.created_at).toLocaleDateString()}</span>
            </div>
            <table className="cart-table">
            <thead>
                <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Subtotal</th>
                </tr>
            </thead>
            <tbody>
                {order.items.map((item) => (
                <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td>${Number(item.price).toFixed(2)}</td>
                    <td>{item.qty}</td>
                    <td>${(item.price * item.qty).toFixed(2)}</td>
                </tr>
                ))}
            </tbody>
            </table>

            {order.awb_number && (
            <div className="order-tracking-row">
                <span>
                {order.carrier || "Carrier"} tracking: <strong>{order.awb_number}</strong>
                </span>
                {trackingUrl && (
                <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="icon-btn"
                    style={{ flex: "none", padding: "6px 14px" }}
                >
                    Track package
                </a>
                )}
            </div>
            )}

            <div className="order-card-total">
            Total: ${Number(order.total).toFixed(2)}
            </div>
        </div>
        );
}

export default Order;