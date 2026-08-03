package com.carrental.dto;

import java.math.BigDecimal;

public class AdminTripResponse {
    private Long id;
    private String carName;
    private String customerName;
    private String customerEmail;
    private String ownerName;
    private String startDate;
    private String endDate;
    private String rentalUnit;
    private Integer rentalQty;
    private BigDecimal totalAmount;
    private String status;
    private String createdAt;

    public AdminTripResponse() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getCarName() { return carName; }
    public void setCarName(String carName) { this.carName = carName; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    public String getCustomerEmail() { return customerEmail; }
    public void setCustomerEmail(String customerEmail) { this.customerEmail = customerEmail; }
    public String getOwnerName() { return ownerName; }
    public void setOwnerName(String ownerName) { this.ownerName = ownerName; }
    public String getStartDate() { return startDate; }
    public void setStartDate(String startDate) { this.startDate = startDate; }
    public String getEndDate() { return endDate; }
    public void setEndDate(String endDate) { this.endDate = endDate; }
    public String getRentalUnit() { return rentalUnit; }
    public void setRentalUnit(String rentalUnit) { this.rentalUnit = rentalUnit; }
    public Integer getRentalQty() { return rentalQty; }
    public void setRentalQty(Integer rentalQty) { this.rentalQty = rentalQty; }
    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
