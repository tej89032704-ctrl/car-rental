package com.carrental.dto;

import java.math.BigDecimal;

public class AdminTransactionResponse {
    private Long id;
    private Long tripId;
    private String customerName;
    private String ownerName;
    private String carName;
    private BigDecimal amount;
    private BigDecimal platformFee;
    private BigDecimal ownerPayout;
    private String paymentMethod;
    private String status;
    private String rentalUnit;
    private Integer rentalQty;
    private String createdAt;

    public AdminTransactionResponse() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getTripId() { return tripId; }
    public void setTripId(Long tripId) { this.tripId = tripId; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    public String getOwnerName() { return ownerName; }
    public void setOwnerName(String ownerName) { this.ownerName = ownerName; }
    public String getCarName() { return carName; }
    public void setCarName(String carName) { this.carName = carName; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public BigDecimal getPlatformFee() { return platformFee; }
    public void setPlatformFee(BigDecimal platformFee) { this.platformFee = platformFee; }
    public BigDecimal getOwnerPayout() { return ownerPayout; }
    public void setOwnerPayout(BigDecimal ownerPayout) { this.ownerPayout = ownerPayout; }
    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getRentalUnit() { return rentalUnit; }
    public void setRentalUnit(String rentalUnit) { this.rentalUnit = rentalUnit; }
    public Integer getRentalQty() { return rentalQty; }
    public void setRentalQty(Integer rentalQty) { this.rentalQty = rentalQty; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
