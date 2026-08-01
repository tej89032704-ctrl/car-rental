package com.carrental.dto;

import java.math.BigDecimal;
import java.math.RoundingMode;

public class RatingSummaryResponse {
    private double average;
    private long count;

    public RatingSummaryResponse() {}

    public RatingSummaryResponse(double average, long count) {
        this.average = average;
        this.count = count;
    }

    public static RatingSummaryResponse of(java.util.List<Integer> ratings) {
        if (ratings == null || ratings.isEmpty()) {
            return new RatingSummaryResponse(0.0, 0);
        }
        long count = ratings.size();
        double sum = 0;
        for (int r : ratings) sum += r;
        double avg = new BigDecimal(sum / count).setScale(1, RoundingMode.HALF_UP).doubleValue();
        return new RatingSummaryResponse(avg, count);
    }

    public double getAverage() { return average; }
    public void setAverage(double average) { this.average = average; }
    public long getCount() { return count; }
    public void setCount(long count) { this.count = count; }
}
