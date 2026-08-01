package com.carrental.dto;

import java.math.BigDecimal;

public class OwnerEarningsResponse {

    private BigDecimal totalGross;
    private BigDecimal totalPlatformFee;
    private BigDecimal totalPayout;
    private int payouts;

    private int dailyTrips;
    private BigDecimal dailyPayout;

    private int hourlyTrips;
    private BigDecimal hourlyPayout;

    public OwnerEarningsResponse() {
        this.totalGross = BigDecimal.ZERO;
        this.totalPlatformFee = BigDecimal.ZERO;
        this.totalPayout = BigDecimal.ZERO;
        this.dailyPayout = BigDecimal.ZERO;
        this.hourlyPayout = BigDecimal.ZERO;
    }

    public BigDecimal getTotalGross() { return totalGross; }
    public void setTotalGross(BigDecimal totalGross) { this.totalGross = totalGross; }
    public BigDecimal getTotalPlatformFee() { return totalPlatformFee; }
    public void setTotalPlatformFee(BigDecimal totalPlatformFee) { this.totalPlatformFee = totalPlatformFee; }
    public BigDecimal getTotalPayout() { return totalPayout; }
    public void setTotalPayout(BigDecimal totalPayout) { this.totalPayout = totalPayout; }
    public int getPayouts() { return payouts; }
    public void setPayouts(int payouts) { this.payouts = payouts; }
    public int getDailyTrips() { return dailyTrips; }
    public void setDailyTrips(int dailyTrips) { this.dailyTrips = dailyTrips; }
    public BigDecimal getDailyPayout() { return dailyPayout; }
    public void setDailyPayout(BigDecimal dailyPayout) { this.dailyPayout = dailyPayout; }
    public int getHourlyTrips() { return hourlyTrips; }
    public void setHourlyTrips(int hourlyTrips) { this.hourlyTrips = hourlyTrips; }
    public BigDecimal getHourlyPayout() { return hourlyPayout; }
    public void setHourlyPayout(BigDecimal hourlyPayout) { this.hourlyPayout = hourlyPayout; }
}
