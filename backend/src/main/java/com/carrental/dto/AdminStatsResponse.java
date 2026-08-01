package com.carrental.dto;

import java.math.BigDecimal;

public class AdminStatsResponse {
    private long customers;
    private long owners;
    private long cars;
    private long trips;
    private long pendingDocuments;
    private long pendingCars;
    private long pendingTrips;
    private BigDecimal totalPayouts;
    private BigDecimal platformRevenue;

    public AdminStatsResponse() {}

    public long getCustomers() { return customers; }
    public void setCustomers(long customers) { this.customers = customers; }
    public long getOwners() { return owners; }
    public void setOwners(long owners) { this.owners = owners; }
    public long getCars() { return cars; }
    public void setCars(long cars) { this.cars = cars; }
    public long getTrips() { return trips; }
    public void setTrips(long trips) { this.trips = trips; }
    public long getPendingDocuments() { return pendingDocuments; }
    public void setPendingDocuments(long pendingDocuments) { this.pendingDocuments = pendingDocuments; }
    public long getPendingCars() { return pendingCars; }
    public void setPendingCars(long pendingCars) { this.pendingCars = pendingCars; }
    public long getPendingTrips() { return pendingTrips; }
    public void setPendingTrips(long pendingTrips) { this.pendingTrips = pendingTrips; }
    public BigDecimal getTotalPayouts() { return totalPayouts; }
    public void setTotalPayouts(BigDecimal totalPayouts) { this.totalPayouts = totalPayouts; }
    public BigDecimal getPlatformRevenue() { return platformRevenue; }
    public void setPlatformRevenue(BigDecimal platformRevenue) { this.platformRevenue = platformRevenue; }
}
